import { describe, expect, it } from 'vitest'

import {
  createPromotionRuleEngine,
  evaluatePromotion,
  PromotionEngineInputError,
  type PromotionCartLine,
  type PromotionDefinition,
  type PromotionRule,
} from '@/lib/promotions/engine'

const NOW = '2026-07-29T04:00:00.000Z'

function promotion(
  overrides: Partial<PromotionDefinition> = {},
): PromotionDefinition {
  return {
    id: 'promotion-1',
    code: 'SAVE10',
    type: 'PERCENT',
    value: 10,
    applicableProductTypes: ['ACCESSORY'],
    maxDiscountAmount: null,
    minimumOrderAmount: 0,
    usageLimit: null,
    usedCount: 0,
    startsAt: '2026-07-01T00:00:00.000Z',
    endsAt: '2026-08-01T00:00:00.000Z',
    isActive: true,
    ...overrides,
  }
}

function lines(
  values: Array<Partial<PromotionCartLine> & Pick<PromotionCartLine, 'id'>>,
): PromotionCartLine[] {
  return values.map((line) => ({
    productType: 'ACCESSORY',
    lineTotal: 100_000,
    ...line,
  }))
}

function codes(result: ReturnType<typeof evaluatePromotion>) {
  return result.violations.map((item) => item.code)
}

describe('Promotion Rule Engine calculations', () => {
  it('calculates a percentage discount using half-up VND rounding', () => {
    const result = evaluatePromotion(
      promotion({ value: 12.5 }),
      lines([{ id: 'line-1', lineTotal: 100_004 }]),
      { now: NOW },
    )

    expect(result).toEqual({
      applicable: true,
      promotionId: 'promotion-1',
      code: 'SAVE10',
      subtotal: 100_004,
      eligibleSubtotal: 100_004,
      discountAmount: 12_501,
      grandTotal: 87_503,
      violations: [],
    })
  })

  it('calculates a fixed discount', () => {
    const result = evaluatePromotion(
      promotion({ type: 'FIXED', value: 30_000 }),
      lines([{ id: 'line-1', lineTotal: 100_000 }]),
      { now: NOW },
    )

    expect(result.discountAmount).toBe(30_000)
    expect(result.grandTotal).toBe(70_000)
  })

  it('caps a percentage discount at maxDiscountAmount', () => {
    const result = evaluatePromotion(
      promotion({ value: 50, maxDiscountAmount: 20_000 }),
      lines([{ id: 'line-1', lineTotal: 100_000 }]),
      { now: NOW },
    )

    expect(result.discountAmount).toBe(20_000)
  })

  it('never lets a fixed discount exceed the eligible subtotal', () => {
    const result = evaluatePromotion(
      promotion({ type: 'FIXED', value: 500_000 }),
      lines([{ id: 'line-1', lineTotal: 80_000 }]),
      { now: NOW },
    )

    expect(result.discountAmount).toBe(80_000)
    expect(result.grandTotal).toBe(0)
  })

  it('discounts only eligible product lines in a mixed cart', () => {
    const result = evaluatePromotion(
      promotion({ value: 20, applicableProductTypes: ['ACCESSORY'] }),
      lines([
        { id: 'accessory', productType: 'ACCESSORY', lineTotal: 100_000 },
        { id: 'bike', productType: 'BIKE', lineTotal: 20_000_000 },
      ]),
      { now: NOW },
    )

    expect(result.subtotal).toBe(20_100_000)
    expect(result.eligibleSubtotal).toBe(100_000)
    expect(result.discountAmount).toBe(20_000)
    expect(result.grandTotal).toBe(20_080_000)
  })

  it('accepts an eligible subtotal exactly equal to the minimum', () => {
    const result = evaluatePromotion(
      promotion({ minimumOrderAmount: 100_000 }),
      lines([{ id: 'line-1', lineTotal: 100_000 }]),
      { now: NOW },
    )

    expect(result.applicable).toBe(true)
  })

  it('supports promotions without an end time', () => {
    const result = evaluatePromotion(
      promotion({ endsAt: null }),
      lines([{ id: 'line-1' }]),
      { now: '2030-01-01T00:00:00.000Z' },
    )

    expect(result.applicable).toBe(true)
  })

  it('returns no discount when the configured cap is zero', () => {
    const result = evaluatePromotion(
      promotion({ maxDiscountAmount: 0 }),
      lines([{ id: 'line-1' }]),
      { now: NOW },
    )

    expect(result.applicable).toBe(false)
    expect(codes(result)).toEqual(['PROMOTION_NO_DISCOUNT'])
  })
})

describe('Promotion Rule Engine eligibility rules', () => {
  it('rejects an empty cart', () => {
    const result = evaluatePromotion(promotion(), [], { now: NOW })

    expect(result.applicable).toBe(false)
    expect(codes(result)).toContain('CART_EMPTY')
  })

  it('rejects an inactive promotion', () => {
    const result = evaluatePromotion(
      promotion({ isActive: false }),
      lines([{ id: 'line-1' }]),
      { now: NOW },
    )

    expect(codes(result)).toEqual(['PROMOTION_INACTIVE'])
  })

  it('rejects a promotion before its start and accepts it at the exact start', () => {
    const before = evaluatePromotion(
      promotion(),
      lines([{ id: 'line-1' }]),
      { now: '2026-06-30T23:59:59.999Z' },
    )
    const atStart = evaluatePromotion(
      promotion(),
      lines([{ id: 'line-1' }]),
      { now: '2026-07-01T00:00:00.000Z' },
    )

    expect(codes(before)).toEqual(['PROMOTION_NOT_STARTED'])
    expect(atStart.applicable).toBe(true)
  })

  it('uses an exclusive end time', () => {
    const result = evaluatePromotion(
      promotion(),
      lines([{ id: 'line-1' }]),
      { now: '2026-08-01T00:00:00.000Z' },
    )

    expect(codes(result)).toEqual(['PROMOTION_EXPIRED'])
  })

  it('rejects an exhausted usage limit and supports unlimited usage', () => {
    const exhausted = evaluatePromotion(
      promotion({ usageLimit: 10, usedCount: 10 }),
      lines([{ id: 'line-1' }]),
      { now: NOW },
    )
    const unlimited = evaluatePromotion(
      promotion({ usageLimit: null, usedCount: 1_000_000 }),
      lines([{ id: 'line-1' }]),
      { now: NOW },
    )

    expect(codes(exhausted)).toEqual(['PROMOTION_USAGE_LIMIT_REACHED'])
    expect(unlimited.applicable).toBe(true)
  })

  it('rejects a cart without an eligible product type', () => {
    const result = evaluatePromotion(
      promotion({ applicableProductTypes: ['CAR'] }),
      lines([{ id: 'line-1', productType: 'ACCESSORY' }]),
      { now: NOW },
    )

    expect(codes(result)).toContain('PROMOTION_PRODUCT_NOT_APPLICABLE')
  })

  it('rejects an eligible subtotal below the minimum', () => {
    const result = evaluatePromotion(
      promotion({ minimumOrderAmount: 100_001 }),
      lines([{ id: 'line-1', lineTotal: 100_000 }]),
      { now: NOW },
    )

    expect(codes(result)).toEqual(['PROMOTION_MINIMUM_NOT_MET'])
    expect(result.violations[0].meta).toEqual({
      eligibleSubtotal: 100_000,
      minimumOrderAmount: 100_001,
    })
  })

  it('collects independent violations without calculating a discount', () => {
    const result = evaluatePromotion(
      promotion({
        isActive: false,
        usageLimit: 1,
        usedCount: 1,
        applicableProductTypes: ['CAR'],
      }),
      lines([{ id: 'line-1', productType: 'ACCESSORY' }]),
      { now: NOW },
    )

    expect(codes(result)).toEqual([
      'PROMOTION_INACTIVE',
      'PROMOTION_USAGE_LIMIT_REACHED',
      'PROMOTION_PRODUCT_NOT_APPLICABLE',
    ])
    expect(result.discountAmount).toBe(0)
    expect(result.grandTotal).toBe(result.subtotal)
  })

  it('supports an additional pure custom rule', () => {
    const customerSegmentRule: PromotionRule = {
      name: 'test-customer-segment',
      evaluate: () => ({
        code: 'PROMOTION_INACTIVE',
        message: 'Tài khoản không thuộc nhóm thử nghiệm.',
      }),
    }
    const engine = createPromotionRuleEngine([customerSegmentRule])

    const result = engine.evaluate(
      promotion(),
      lines([{ id: 'line-1' }]),
      { now: NOW },
    )

    expect(result.applicable).toBe(false)
    expect(result.violations[0].message).toBe(
      'Tài khoản không thuộc nhóm thử nghiệm.',
    )
  })
})

describe('Promotion Rule Engine input validation', () => {
  it.each([
    ['empty id', promotion({ id: '' }), 'promotion.id'],
    ['empty code', promotion({ code: ' ' }), 'promotion.code'],
    ['unsupported percentage', promotion({ value: 101 }), 'promotion.value'],
    ['zero percentage', promotion({ value: 0 }), 'promotion.value'],
    ['fractional fixed VND', promotion({ type: 'FIXED', value: 1.5 }), 'promotion.value'],
    ['negative minimum', promotion({ minimumOrderAmount: -1 }), 'promotion.minimumOrderAmount'],
    ['negative cap', promotion({ maxDiscountAmount: -1 }), 'promotion.maxDiscountAmount'],
    ['negative usage', promotion({ usedCount: -1 }), 'promotion.usedCount'],
    ['zero usage limit', promotion({ usageLimit: 0 }), 'promotion.usageLimit'],
    ['no product type', promotion({ applicableProductTypes: [] }), 'promotion.applicableProductTypes'],
    ['invalid start', promotion({ startsAt: 'not-a-date' }), 'promotion.startsAt'],
    [
      'end before start',
      promotion({ endsAt: '2026-06-01T00:00:00.000Z' }),
      'promotion.endsAt',
    ],
  ])('rejects %s', (_label, candidate, expectedField) => {
    expect(() =>
      evaluatePromotion(
        candidate as PromotionDefinition,
        lines([{ id: 'line-1' }]),
        { now: NOW },
      ),
    ).toThrowError(
      expect.objectContaining<Partial<PromotionEngineInputError>>({
        field: expectedField,
      }),
    )
  })

  it.each([
    ['empty id', lines([{ id: '' }]), 'lines.0.id'],
    [
      'duplicate id',
      lines([{ id: 'same' }, { id: 'same' }]),
      'lines.1.id',
    ],
    [
      'negative total',
      lines([{ id: 'line-1', lineTotal: -1 }]),
      'lines.0.lineTotal',
    ],
    [
      'fractional total',
      lines([{ id: 'line-1', lineTotal: 1.5 }]),
      'lines.0.lineTotal',
    ],
  ])('rejects cart line with %s', (_label, cartLines, expectedField) => {
    expect(() =>
      evaluatePromotion(promotion(), cartLines, { now: NOW }),
    ).toThrowError(
      expect.objectContaining<Partial<PromotionEngineInputError>>({
        field: expectedField,
      }),
    )
  })

  it('rejects an invalid evaluation clock', () => {
    expect(() =>
      evaluatePromotion(
        promotion(),
        lines([{ id: 'line-1' }]),
        { now: 'not-a-date' },
      ),
    ).toThrowError(
      expect.objectContaining<Partial<PromotionEngineInputError>>({
        field: 'options.now',
      }),
    )
  })

  it('does not mutate the promotion or cart lines', () => {
    const candidate = Object.freeze(promotion())
    const cartLines = Object.freeze(
      lines([{ id: 'line-1' }]).map((line) => Object.freeze(line)),
    )

    expect(() =>
      evaluatePromotion(candidate, cartLines, { now: NOW }),
    ).not.toThrow()
  })
})
