import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSupabaseAdmin: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }))
vi.mock('@/lib/mailer', () => ({
  sendPaymentSuccessEmail: vi.fn(),
}))
vi.mock('@/lib/payments/vnpay', () => ({
  createVnPayPaymentUrl: vi.fn(),
  verifyVnPayHash: vi.fn(() => true),
  vnPayConfig: vi.fn(() => ({ tmnCode: 'FASTLANE' })),
}))

import { processVnPayCallback } from './vnpay-payment-service'

const attempt = {
  id: 'attempt-1',
  deposit_order_id: 'deposit-1',
  transaction_reference: 'FLD-REF-1',
  order_number: 'FLD-ORDER-1',
  amount_vnd: 2_000_000,
  status: 'PENDING' as const,
}

const params = {
  vnp_TmnCode: 'FASTLANE',
  vnp_TxnRef: attempt.transaction_reference,
  vnp_Amount: '200000000',
  vnp_ResponseCode: '00',
  vnp_TransactionStatus: '00',
  vnp_TransactionNo: 'VNP-1',
  vnp_BankCode: 'NCB',
  vnp_SecureHash: 'verified-by-mock',
}

function queryResult(data: unknown) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
      })),
    })),
  }
}

function supabaseFor(command: Record<string, unknown>) {
  const rpcSingle = vi.fn().mockResolvedValue({ data: command, error: null })
  const rpc = vi.fn(() => ({ single: rpcSingle }))
  const from = vi.fn((table: string) => {
    if (table === 'vnpay_checkout_attempts') return queryResult(null)
    if (table === 'vnpay_deposit_attempts') return queryResult(attempt)
    if (table === 'deposit_orders') return queryResult({ email: 'test@example.com' })
    throw new Error(`Unexpected table: ${table}`)
  })
  return { client: { from, rpc }, from, rpc, rpcSingle }
}

describe('VNPAY deposit callback ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the customer Return flow read-only', async () => {
    const db = supabaseFor({})
    mocks.getSupabaseAdmin.mockReturnValue(db.client)

    const result = await processVnPayCallback(params, { updatePayment: false })

    expect(result.success).toBe(false)
    expect(result.message).toContain('Đang chờ xác nhận')
    expect(result.orderKind).toBe('deposit')
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('uses the atomic database command for an IPN success', async () => {
    const db = supabaseFor({
      attempt_status: 'PAID',
      order_status: 'PENDING_CONFIRMATION',
      refund_status: 'NONE',
      outcome: 'PAYMENT_CONFIRMED',
      replayed: false,
    })
    mocks.getSupabaseAdmin.mockReturnValue(db.client)

    const result = await processVnPayCallback(params)

    expect(result.success).toBe(true)
    expect(db.rpc).toHaveBeenCalledWith('process_vnpay_deposit_callback', expect.objectContaining({
      p_attempt_id: attempt.id,
      p_success: true,
      p_transaction_no: 'VNP-1',
    }))
  })

  it('waits for admin confirmation when payment arrives after cancellation', async () => {
    const db = supabaseFor({
      attempt_status: 'PAID',
      order_status: 'CANCELLED',
      refund_status: 'PENDING',
      outcome: 'REFUND_REQUIRED',
      replayed: false,
    })
    mocks.getSupabaseAdmin.mockReturnValue(db.client)
    const result = await processVnPayCallback(params)

    expect(result.success).toBe(false)
    expect(result.message).toContain('chờ quản trị viên xác nhận hoàn tiền')
  })
})
