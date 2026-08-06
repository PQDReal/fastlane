import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(new URL('./route.ts', import.meta.url), 'utf8')

describe('deposit route safety contract', () => {
  it('scopes authenticated idempotency lookups to customer_id', () => {
    expect(source).toContain("query.eq('customer_id', customerId)")
  })

  it('keeps guest idempotency lookups separate from authenticated users', () => {
    expect(source).toContain("query.is('customer_id', null)")
    expect(source).toContain(".ilike('email', guestEmail)")
  })

  it('compares request hashes after a concurrent unique-key conflict', () => {
    expect(source).toMatch(/error\.code === '23505'[\s\S]*decideDepositReplay\(replay\.request_hash, hash\)/)
  })

  it('does not write canonical motorbike IDs into the legacy product variant relation', () => {
    expect(source).not.toMatch(/\n\s*variant_id\s*:/)
    expect(source).toMatch(
      /vehicleVariantId: string \| null = input\.vehicleType === 'motorbike'[\s\S]*\? quote\.variantId/,
    )
    expect(source).not.toContain('vehicleVariantId = quote.variantId')
  })

  it('stores the authoritative promotion quote without incrementing quota in application code', () => {
    expect(source).toContain('discount_amount: quote.discountAmount')
    expect(source).toContain('promotion_id: quote.promotion?.id ?? null')
    expect(source).toContain('promotion_code: quote.promotion?.code ?? null')
    expect(source).not.toMatch(/from\('promotions'\)[\s\S]{0,300}used_count/)
  })

  it('rejects zero-value deposits before creating a payment attempt', () => {
    expect(source).toContain("'INVALID_PAYMENT_AMOUNT'")
    expect(source).toMatch(/quote\.totalEstimatedPrice <= 0[\s\S]{0,180}quote\.depositAmount <= 0/)
  })
})
