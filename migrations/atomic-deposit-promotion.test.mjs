import fs from 'node:fs'

import { describe, expect, it } from 'vitest'

const sql = fs.readFileSync(
  new URL('./038_atomic_deposit_promotion.sql', import.meta.url),
  'utf8',
)

describe('atomic deposit promotion migration', () => {
  it('locks and consumes promotion quota inside the deposit insert transaction', () => {
    expect(sql).toMatch(/from public\.promotions[\s\S]*for update/i)
    expect(sql).toMatch(/usage_limit[\s\S]*PROMOTION_USAGE_EXHAUSTED/i)
    expect(sql).toMatch(/set used_count\s*=\s*used_count\s*\+\s*1/i)
    expect(sql).toMatch(/before insert on public\.deposit_orders/i)
  })

  it('rejects a stale or client-forged promotion snapshot', () => {
    expect(sql).toMatch(/new\.discount_amount\s*<>\s*expected_discount/i)
    expect(sql).toMatch(/new\.total_estimated_price\s*<>\s*new\.subtotal\s*-\s*expected_discount/i)
    expect(sql).toMatch(/PROMOTION_SNAPSHOT_MISMATCH/i)
  })
})
