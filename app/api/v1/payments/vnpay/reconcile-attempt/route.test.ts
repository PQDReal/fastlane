import { beforeEach, describe, expect, it, vi } from 'vitest'

const reconcile = vi.fn()

vi.mock('@/lib/services/vnpay-payment-reconciliation-service', () => ({
  reconcileVnPayPaymentAttempt: reconcile,
}))

describe('delayed VNPay reconciliation endpoint', () => {
  beforeEach(() => {
    vi.resetModules()
    reconcile.mockReset()
    vi.stubEnv('QSTASH_CALLBACK_SECRET', 'callback-secret')
  })

  it('rejects requests without the callback secret', async () => {
    const { POST } = await import('./route')
    const response = await POST(new Request('https://fastlane.example/api/v1/payments/vnpay/reconcile-attempt', {
      method: 'POST',
      body: JSON.stringify({ attemptId: 'attempt-1', orderKind: 'deposit' }),
    }))
    expect(response.status).toBe(401)
    expect(reconcile).not.toHaveBeenCalled()
  })

  it('retries while VNPay still has no final result', async () => {
    reconcile.mockResolvedValue({ status: 'PENDING' })
    const { POST } = await import('./route')
    const response = await POST(new Request('https://fastlane.example/api/v1/payments/vnpay/reconcile-attempt', {
      method: 'POST',
      headers: { Authorization: 'Bearer callback-secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ attemptId: 'attempt-1', orderKind: 'deposit' }),
    }))
    expect(response.status).toBe(503)
  })

  it('acknowledges a final payment result', async () => {
    reconcile.mockResolvedValue({ status: 'PAID' })
    const { POST } = await import('./route')
    const response = await POST(new Request('https://fastlane.example/api/v1/payments/vnpay/reconcile-attempt', {
      method: 'POST',
      headers: { Authorization: 'Bearer callback-secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ attemptId: 'attempt-1', orderKind: 'accessory' }),
    }))
    expect(response.status).toBe(200)
  })
})
