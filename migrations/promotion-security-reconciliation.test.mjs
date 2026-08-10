import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('./046_reconcile_promotion_security.sql', import.meta.url),
  'utf8',
)

describe('promotion security reconciliation migration', () => {
  it('preserves both global and per-user quota semantics', () => {
    expect(sql).toContain("promotion_row.usage_scope = 'PER_USER'")
    expect(sql).toContain("promotion_row.usage_scope = 'GLOBAL'")
    expect(sql).toContain('promotion_row.target_user_id')
    expect(sql).toContain('consume_per_user_promotion')
  })

  it('recomputes and verifies the immutable order price snapshot', () => {
    expect(sql).toContain('expected_discount := case')
    expect(sql).toContain('PROMOTION_SNAPSHOT_MISMATCH')
    expect(sql).toContain('new.total_estimated_price is distinct from new.subtotal - expected_discount')
  })

  it('removes overload ambiguity and browser execution privileges', () => {
    expect(sql).toContain('drop function if exists public.consume_per_user_promotion(uuid, uuid, integer)')
    expect(sql).toMatch(/revoke all on function public\.consume_per_user_promotion[\s\S]+from public, anon, authenticated/i)
    expect(sql).toMatch(/refresh_product_displayed_price[\s\S]+from public, anon, authenticated/i)
    expect(sql).toMatch(/sync_product_displayed_price[\s\S]+from public, anon, authenticated/i)
  })
})
