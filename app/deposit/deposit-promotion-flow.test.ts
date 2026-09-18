import fs from 'node:fs'

import { describe, expect, it } from 'vitest'

const client = fs.readFileSync(new URL('./DepositClient.tsx', import.meta.url), 'utf8')

describe('deposit promotion flow', () => {
  it('uses the authoritative deposit quote for cars and motorbikes', () => {
    expect(client).toContain("fetch('/api/deposit/quote'")
    expect(client).toContain("? 'motorbike' : 'car'")
    expect(client).toContain('setPromotionQuote(result.data as DepositQuote)')
  })

  it('submits only a promotion code that was successfully quoted', () => {
    expect(client).toContain(
      'promotion_code: promotionQuote?.promotion?.code ?? null',
    )
    expect(client).not.toContain('promotion_code: promotionCode.trim().toUpperCase()')
  })

  it('revalidates a typed code before moving to payment details', () => {
    expect(client).toMatch(
      /promotionCode\.trim\(\) && !promotionQuote[\s\S]*await handleApplyPromotion\(\)/,
    )
  })
})
