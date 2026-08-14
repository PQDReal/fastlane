import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createVnPayHash,
  createVnPayPaymentUrl,
  verifyVnPayHash,
  vnPaySigningData,
  vnPayTransactionOutcome,
} from './vnpay'

describe('VNPAY', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('sorts and encodes signing parameters', () => {
    expect(vnPaySigningData({ vnp_TxnRef: 'FL 01', vnp_Amount: '100', vnp_SecureHash: 'x' }))
      .toBe('vnp_Amount=100&vnp_TxnRef=FL+01')
  })
  it('creates and verifies HMAC SHA512', () => {
    const params = { vnp_Amount: '100', vnp_TxnRef: 'FL01' }
    const signed = { ...params, vnp_SecureHash: createVnPayHash(params, 'secret') }
    expect(verifyVnPayHash(signed, 'secret')).toBe(true)
    expect(verifyVnPayHash({ ...signed, vnp_Amount: '200' }, 'secret')).toBe(false)
  })
  it('creates a signed sandbox payment URL', () => {
    vi.stubEnv('VNPAY_TMN_CODE', 'DEMO1234')
    vi.stubEnv('VNPAY_HASH_SECRET', 'sandbox-secret')
    vi.stubEnv('VNPAY_RETURN_URL', 'http://localhost:3000/payment/vnpay/return')
    const url = new URL(createVnPayPaymentUrl({
      transactionReference: 'FL123',
      orderNumber: 'FLD-123',
      amountVnd: 5_000_000,
      clientIp: '127.0.0.1',
      now: new Date('2026-08-03T07:00:00.000Z'),
    }))
    const params = Object.fromEntries(url.searchParams.entries())
    expect(url.origin + url.pathname).toBe('https://sandbox.vnpayment.vn/paymentv2/vpcpay.html')
    expect(params.vnp_Amount).toBe('500000000')
    expect(params.vnp_BankCode).toBeUndefined()
    expect(verifyVnPayHash(params, 'sandbox-secret')).toBe(true)
  })
  it.each([
    ['00', 'PAID'], ['10', 'PAID'], ['20', 'PAID'],
    ['02', 'FAILED'], ['04', 'FAILED'], ['07', 'FAILED'], ['08', 'FAILED'], ['11', 'FAILED'],
    ['01', 'PENDING'], ['05', 'PENDING'], ['06', 'PENDING'], ['09', 'PENDING'], ['', 'PENDING'],
  ] as const)('classifies transaction status %s as %s', (status, outcome) => {
    expect(vnPayTransactionOutcome(status)).toBe(outcome)
  })
})
