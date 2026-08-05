import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const checkoutService = readFileSync(new URL('./checkout.ts', import.meta.url), 'utf8')
const checkoutPage = readFileSync(new URL('../../app/checkout/page.tsx', import.meta.url), 'utf8')

describe('accessory checkout unique constraint handling', () => {
  it('only reports idempotency reuse when an order with the key exists', () => {
    expect(checkoutService).toMatch(/if \(existing\) \{[\s\S]*?'IDEMPOTENCY_KEY_REUSED'/)
    expect(checkoutService).toContain("'CHECKOUT_CONFLICT'")
    expect(checkoutService).toContain('error.details')
    expect(checkoutService).toContain('error.hint')
  })

  it('recovers a pending order when the source cart was already converted', () => {
    expect(checkoutService).toMatch(/sourceCartIdFromUniqueViolation\(error\.details\)/)
    expect(checkoutService).toMatch(/eq\('source_cart_id', sourceCartId\)/)
    expect(checkoutService).toMatch(/result\.data\.status !== 'PENDING'/)
    expect(checkoutService).toMatch(/if \(recovered\) return recovered/)
  })

  it('rotates the browser idempotency key after checkout conflicts', () => {
    expect(checkoutPage).toMatch(/'IDEMPOTENCY_KEY_REUSED', 'CHECKOUT_CONFLICT'/)
    expect(checkoutPage).toContain('idempotencyKey.current = null')
  })
})
