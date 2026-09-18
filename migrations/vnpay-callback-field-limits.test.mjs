import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('./048_align_vnpay_callback_field_limits.sql', import.meta.url),
  'utf8',
)

describe('VNPAY callback field limit migration', () => {
  it('rejects callback fields longer than their persisted varchar limits', () => {
    expect(sql).toMatch(/length\(coalesce\(p_response_code, ''\)\) > 32/i)
    expect(sql).toMatch(/length\(coalesce\(p_transaction_no, ''\)\) > 32/i)
    expect(sql).toMatch(/length\(coalesce\(p_bank_code, ''\)\) > 32/i)
    expect(sql).not.toMatch(/length\(coalesce\(p_transaction_no, ''\)\) > 180/i)
    expect(sql).toContain("message = 'DEPOSIT_CALLBACK_INPUT_INVALID'")
  })

  it('preserves every atomic callback outcome while replacing the RPC', () => {
    expect(sql).toMatch(/vnpay_deposit_attempts[\s\S]+for update/i)
    expect(sql).toMatch(/deposit_orders[\s\S]+for update/i)
    expect(sql).toContain("v_outcome := 'PAYMENT_CONFIRMED'")
    expect(sql).toContain("v_outcome := 'REFUND_REQUIRED'")
    expect(sql).toContain("v_outcome := 'ORDER_ALREADY_ADVANCED'")
  })

  it('casts varchar projections to the declared text result columns', () => {
    expect(sql.match(/v_attempt\.status::text/g)).toHaveLength(4)
    expect(sql.match(/v_order\.status::text/g)).toHaveLength(4)
    expect(sql.match(/v_order\.refund_status::text/g)).toHaveLength(4)
  })

  it('preserves service-role-only execution', () => {
    expect(sql).toMatch(/revoke all on function public\.process_vnpay_deposit_callback[\s\S]+from public, anon, authenticated/i)
    expect(sql).toMatch(/grant execute on function public\.process_vnpay_deposit_callback[\s\S]+to service_role/i)
  })
})
