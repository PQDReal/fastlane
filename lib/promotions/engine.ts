import type { PromotionProductType } from '@/lib/promotions/product-types'
import { defaultPromotionRules } from '@/lib/promotions/rules'

export type PromotionDiscountType = 'PERCENT' | 'FIXED'

export type PromotionDefinition = {
  id: string
  code: string
  type: PromotionDiscountType
  value: number
  applicableProductTypes: readonly PromotionProductType[]
  maxDiscountAmount: number | null
  minimumOrderAmount: number
  usageLimit: number | null
  usedCount: number
  startsAt: string | number | Date
  endsAt: string | number | Date | null
  isActive: boolean
}

export type PromotionCartLine = {
  id: string
  productType: PromotionProductType
  lineTotal: number
}

export type PromotionRuleCode =
  | 'CART_EMPTY'
  | 'PROMOTION_INACTIVE'
  | 'PROMOTION_NOT_STARTED'
  | 'PROMOTION_EXPIRED'
  | 'PROMOTION_USAGE_LIMIT_REACHED'
  | 'PROMOTION_PRODUCT_NOT_APPLICABLE'
  | 'PROMOTION_MINIMUM_NOT_MET'
  | 'PROMOTION_NO_DISCOUNT'

export type PromotionRuleViolation = {
  code: PromotionRuleCode
  message: string
  meta?: Record<string, number | string | boolean | null>
}

export type PromotionRuleContext = {
  promotion: Readonly<PromotionDefinition>
  lines: readonly Readonly<PromotionCartLine>[]
  now: number
  startsAt: number
  endsAt: number | null
  subtotal: number
  eligibleSubtotal: number
}

export interface PromotionRule {
  readonly name: string
  evaluate(context: PromotionRuleContext): PromotionRuleViolation | null
}

export type PromotionEvaluation = {
  applicable: boolean
  promotionId: string
  code: string
  subtotal: number
  eligibleSubtotal: number
  discountAmount: number
  grandTotal: number
  violations: PromotionRuleViolation[]
}

export type PromotionEngine = {
  evaluate(
    promotion: Readonly<PromotionDefinition>,
    lines: readonly Readonly<PromotionCartLine>[],
    options?: { now?: string | number | Date },
  ): PromotionEvaluation
}

export class PromotionEngineInputError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message)
    this.name = 'PromotionEngineInputError'
  }
}

const PRODUCT_TYPES = new Set<PromotionProductType>([
  'CAR',
  'BIKE',
  'ACCESSORY',
])

function instant(value: string | number | Date, field: string) {
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime()
  if (!Number.isFinite(parsed)) {
    throw new PromotionEngineInputError(field, `${field} phải là thời điểm hợp lệ.`)
  }
  return parsed
}

function wholeVnd(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new PromotionEngineInputError(
      field,
      `${field} phải là số nguyên VND không âm và an toàn.`,
    )
  }
}

function validatePromotion(promotion: Readonly<PromotionDefinition>) {
  if (!promotion.id.trim()) {
    throw new PromotionEngineInputError('promotion.id', 'Promotion id không được để trống.')
  }
  if (!promotion.code.trim()) {
    throw new PromotionEngineInputError('promotion.code', 'Promotion code không được để trống.')
  }
  if (promotion.type === 'PERCENT') {
    if (!Number.isFinite(promotion.value) || promotion.value <= 0 || promotion.value > 100) {
      throw new PromotionEngineInputError(
        'promotion.value',
        'Phần trăm giảm phải lớn hơn 0 và không vượt quá 100.',
      )
    }
  } else if (promotion.type === 'FIXED') {
    wholeVnd(promotion.value, 'promotion.value')
    if (promotion.value === 0) {
      throw new PromotionEngineInputError(
        'promotion.value',
        'Số tiền giảm phải lớn hơn 0.',
      )
    }
  } else {
    throw new PromotionEngineInputError(
      'promotion.type',
      'Loại khuyến mãi không được hỗ trợ.',
    )
  }

  wholeVnd(promotion.minimumOrderAmount, 'promotion.minimumOrderAmount')
  if (promotion.maxDiscountAmount !== null) {
    wholeVnd(promotion.maxDiscountAmount, 'promotion.maxDiscountAmount')
  }
  if (!Number.isSafeInteger(promotion.usedCount) || promotion.usedCount < 0) {
    throw new PromotionEngineInputError(
      'promotion.usedCount',
      'Số lượt đã dùng phải là số nguyên không âm.',
    )
  }
  if (
    promotion.usageLimit !== null &&
    (!Number.isSafeInteger(promotion.usageLimit) || promotion.usageLimit < 1)
  ) {
    throw new PromotionEngineInputError(
      'promotion.usageLimit',
      'Giới hạn sử dụng phải là số nguyên lớn hơn 0.',
    )
  }
  if (promotion.applicableProductTypes.length === 0) {
    throw new PromotionEngineInputError(
      'promotion.applicableProductTypes',
      'Khuyến mãi phải áp dụng cho ít nhất một loại sản phẩm.',
    )
  }
  for (const productType of promotion.applicableProductTypes) {
    if (!PRODUCT_TYPES.has(productType)) {
      throw new PromotionEngineInputError(
        'promotion.applicableProductTypes',
        `Loại sản phẩm ${productType} không hợp lệ.`,
      )
    }
  }
}

function validateLines(lines: readonly Readonly<PromotionCartLine>[]) {
  const ids = new Set<string>()
  lines.forEach((line, index) => {
    if (!line.id.trim()) {
      throw new PromotionEngineInputError(
        `lines.${index}.id`,
        'Cart line id không được để trống.',
      )
    }
    if (ids.has(line.id)) {
      throw new PromotionEngineInputError(
        `lines.${index}.id`,
        'Cart line id không được trùng.',
      )
    }
    ids.add(line.id)
    if (!PRODUCT_TYPES.has(line.productType)) {
      throw new PromotionEngineInputError(
        `lines.${index}.productType`,
        'Loại sản phẩm trong giỏ không hợp lệ.',
      )
    }
    wholeVnd(line.lineTotal, `lines.${index}.lineTotal`)
  })
}

function calculateDiscount(context: PromotionRuleContext) {
  const { promotion, eligibleSubtotal } = context
  let discount = promotion.type === 'PERCENT'
    ? Math.round(eligibleSubtotal * promotion.value / 100)
    : promotion.value

  if (promotion.maxDiscountAmount !== null) {
    discount = Math.min(discount, promotion.maxDiscountAmount)
  }
  return Math.max(0, Math.min(discount, eligibleSubtotal, context.subtotal))
}

export function createPromotionRuleEngine(
  rules: readonly PromotionRule[] = defaultPromotionRules,
): PromotionEngine {
  const configuredRules = [...rules]

  return {
    evaluate(promotion, lines, options = {}) {
      validatePromotion(promotion)
      validateLines(lines)

      const startsAt = instant(promotion.startsAt, 'promotion.startsAt')
      const endsAt = promotion.endsAt === null
        ? null
        : instant(promotion.endsAt, 'promotion.endsAt')
      if (endsAt !== null && endsAt <= startsAt) {
        throw new PromotionEngineInputError(
          'promotion.endsAt',
          'Thời gian kết thúc phải sau thời gian bắt đầu.',
        )
      }

      const now = options.now === undefined
        ? Date.now()
        : instant(options.now, 'options.now')
      const applicableTypes = new Set(promotion.applicableProductTypes)
      const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0)
      const eligibleSubtotal = lines.reduce(
        (sum, line) => applicableTypes.has(line.productType)
          ? sum + line.lineTotal
          : sum,
        0,
      )
      wholeVnd(subtotal, 'subtotal')
      wholeVnd(eligibleSubtotal, 'eligibleSubtotal')

      const context: PromotionRuleContext = {
        promotion,
        lines,
        now,
        startsAt,
        endsAt,
        subtotal,
        eligibleSubtotal,
      }
      const violations = configuredRules
        .map((rule) => rule.evaluate(context))
        .filter((violation): violation is PromotionRuleViolation => violation !== null)

      if (violations.length > 0) {
        return {
          applicable: false,
          promotionId: promotion.id,
          code: promotion.code,
          subtotal,
          eligibleSubtotal,
          discountAmount: 0,
          grandTotal: subtotal,
          violations,
        }
      }

      const discountAmount = calculateDiscount(context)
      if (discountAmount === 0) {
        return {
          applicable: false,
          promotionId: promotion.id,
          code: promotion.code,
          subtotal,
          eligibleSubtotal,
          discountAmount: 0,
          grandTotal: subtotal,
          violations: [{
            code: 'PROMOTION_NO_DISCOUNT',
            message: 'Khuyến mãi không tạo ra giá trị giảm cho giỏ hàng.',
          }],
        }
      }

      return {
        applicable: true,
        promotionId: promotion.id,
        code: promotion.code,
        subtotal,
        eligibleSubtotal,
        discountAmount,
        grandTotal: subtotal - discountAmount,
        violations: [],
      }
    },
  }
}

export const promotionRuleEngine = createPromotionRuleEngine()

export function evaluatePromotion(
  promotion: Readonly<PromotionDefinition>,
  lines: readonly Readonly<PromotionCartLine>[],
  options?: { now?: string | number | Date },
) {
  return promotionRuleEngine.evaluate(promotion, lines, options)
}
