import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('./045_deposit_order_command_integrity.sql', import.meta.url),
  'utf8',
)

describe('deposit order command integrity migration', () => {
  it('records VNPAY attempt and order state in one row-locked command', () => {
    expect(sql).toContain('process_vnpay_deposit_callback')
    expect(sql).toMatch(/vnpay_deposit_attempts[\s\S]+for update/i)
    expect(sql).toMatch(/deposit_orders[\s\S]+for update/i)
    expect(sql).toContain("v_outcome := 'REFUND_REQUIRED'")
    expect(sql).toContain("'LATE_DEPOSIT_PAYMENT_RECEIVED'")
  })

  it('uses named admin commands instead of arbitrary status writes', () => {
    expect(sql).toContain('admin_cancel_deposit_order_before_signature')
    expect(sql).toContain('advance_deposit_order_delivery')
    expect(sql).toContain("p_target_status not in ('DELIVERED', 'COMPLETED')")
    expect(sql).toContain("v_order.status <> v_expected_status")
    expect(sql).toContain('guard_deposit_order_status_transition')
    expect(sql).toContain("old.status = 'PREPARING_DELIVERY' and new.status = 'DELIVERED'")
  })

  it('supports audited guest claim and explicit missing-document repair', () => {
    expect(sql).toContain('claim_guest_deposit_order')
    expect(sql).toContain("'DEPOSIT_ORDER_CLAIMED'")
    expect(sql).toContain('admin_requeue_unissued_deposit_document')
    expect(sql).toContain("'MISSING_LEGAL_DOCUMENT'")
    expect(sql).toContain('admin_queue_cancelled_deposit_refund')
    expect(sql).toContain("'ADMIN_LEGACY_REFUND_REPAIR'")
  })

  it('keeps every privileged command service-role-only', () => {
    for (const signature of [
      'process_vnpay_deposit_callback',
      'admin_cancel_deposit_order_before_signature',
      'advance_deposit_order_delivery',
      'claim_guest_deposit_order',
      'admin_requeue_unissued_deposit_document',
      'admin_queue_cancelled_deposit_refund',
      'guard_deposit_order_status_transition',
    ]) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${signature}[\\s\\S]+from public, anon, authenticated`, 'i'))
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${signature}[\\s\\S]+to service_role`, 'i'))
    }
  })
})
