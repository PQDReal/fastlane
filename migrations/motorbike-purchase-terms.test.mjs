import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('./044_motorbike_purchase_terms_contract.sql', import.meta.url),
  'utf8',
)

describe('motorbike purchase terms migration', () => {
  it('accepts both supported document types but matches type to vehicle', () => {
    expect(sql).toContain("'CAR_SALES_CONTRACT', 'MOTORBIKE_SALES_CONTRACT'")
    expect(sql).toContain('CONTRACT_DOCUMENT_VEHICLE_MISMATCH')
    expect(sql).toContain("v_order.vehicle_type = 'motorbike'")
  })

  it('keeps the deposit, KYC and signature gates', () => {
    expect(sql).toContain("v_order.status <> 'CONFIRMED'")
    expect(sql).toContain("v_order.kyc_status is distinct from 'APPROVED'")
    expect(sql).toContain("where deposit_order_id = p_order_id and status = 'PAID'")
    expect(sql).toContain("make_interval(hours => p_signature_window_hours)")
  })

  it('preserves least-privilege RPC execution', () => {
    expect(sql).toMatch(/revoke all on function public\.issue_deposit_order_contract[\s\S]+from public, anon, authenticated/i)
    expect(sql).toMatch(/grant execute on function public\.issue_deposit_order_contract[\s\S]+to service_role/i)
  })

  it('does not replay an event whose legal document is missing or inactive', () => {
    expect(sql).toContain("v_document.status <> 'PENDING_SIGNATURE'")
    expect(sql).toContain('CONTRACT_ISSUE_EVENT_DOCUMENT_INACTIVE')
  })
})
