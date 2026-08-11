import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./actions.ts', import.meta.url), 'utf8')
const drawerSource = readFileSync(new URL('./order-detail-drawer.tsx', import.meta.url), 'utf8')
const clientSource = readFileSync(new URL('./orders-client.tsx', import.meta.url), 'utf8')
const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')
const statusPresentationSource = readFileSync(new URL('../../../lib/orders/admin-status-presentation.ts', import.meta.url), 'utf8')
const refundServiceSource = readFileSync(new URL('../../../lib/services/vnpay-refund-service.ts', import.meta.url), 'utf8')
const customerCancellationSource = readFileSync(new URL('../../api/v1/deposit-orders/[orderId]/route.ts', import.meta.url), 'utf8')
const expirySource = readFileSync(new URL('../../api/v1/deposit-orders/expire-contracts/route.ts', import.meta.url), 'utf8')
const paymentServiceSource = readFileSync(new URL('../../../lib/services/vnpay-payment-service.ts', import.meta.url), 'utf8')

describe('admin deposit commands', () => {
  it('routes cancellation and delivery through named atomic RPCs', () => {
    expect(source).toContain("rpc('admin_cancel_deposit_order_before_signature'")
    expect(source).toContain("rpc('advance_deposit_order_delivery'")
    expect(source).not.toMatch(/\.update\(\{\s*status:\s*newStatus/)
  })

  it('keeps approval compare-and-set constrained to PENDING_CONFIRMATION', () => {
    expect(source).toMatch(/update\(\{ status: 'CONFIRMED'[\s\S]+eq\('status', 'PENDING_CONFIRMATION'\)/)
  })

  it('routes initial issue and missing-document repair through the issue endpoint', () => {
    expect(drawerSource).toContain("newStatus === 'PENDING_CONTRACT'")
    expect(drawerSource).toContain("/contract/issue")
  })

  it('keeps debug shortcuts outside production and inside command boundaries', () => {
    expect(source).toContain("'mock_deposit_paid' | 'mock_confirm_order' | 'mock_kyc_approved'")
    expect(source).toContain('assertDepositDebugActionsEnabled()')
    expect(source).toContain("rpc('process_vnpay_deposit_callback'")
    expect(source).toContain('p_transaction_no: createDebugVnpayTransactionNo()')
    expect(source).toContain('tryAutoIssueContract(supabase, orderId)')
    expect(source).not.toContain('forceOrderState')
    expect(source).not.toContain('mock_full_paid')
    expect(source).not.toContain('mock_contract_signed')
    expect(drawerSource).toContain('debugActionsEnabled &&')
    expect(drawerSource).not.toContain('description:')
  })

  it('reconciles pending deposit refunds like accessory refunds', () => {
    expect(source).toContain('reconcileVnPayDepositRefund')
    expect(refundServiceSource).toContain('export async function reconcileVnPayDepositRefund')
    expect(refundServiceSource).toContain("from('vnpay_deposit_refund_attempts')")
    expect(refundServiceSource).toContain("vnp_Command: 'querydr'")
    expect(pageSource).toContain("from('vnpay_deposit_refund_attempts')")
    expect(pageSource).toContain("select('deposit_order_id,status,created_at,updated_at')")
    expect(pageSource).not.toContain("select('deposit_order_id,status,requested_at,updated_at')")
    expect(clientSource).toContain('reconcileDepositRefund(nextOrder.id)')
    expect(drawerSource).toContain('Đang tự động kiểm tra hoàn tiền')
    expect(drawerSource).toContain('Thử hoàn tiền lại')
  })

  it('uses the cancelled badge color after a refund completes', () => {
    expect(statusPresentationSource).toContain("if (refundStatus === 'COMPLETED')")
    expect(statusPresentationSource).toContain("'success'")
    expect(clientSource).toContain('<AdminOrderStatusBadge presentation={displayStatus} />')
  })

  it('requires admin confirmation before sending a deposit refund', () => {
    expect(source.match(/refundCancelledDepositOrder\(/g)).toHaveLength(1)
    expect(source).toContain('export async function confirmDepositRefund')
    expect(customerCancellationSource).not.toContain('refundCancelledDepositOrder')
    expect(customerCancellationSource).toContain('refund_requires_admin_confirmation')
    expect(expirySource).not.toContain('refundCancelledDepositOrder')
    expect(paymentServiceSource).not.toContain('refundCancelledDepositOrder')
    expect(drawerSource).toContain('Xác nhận hoàn tiền')
  })
})
