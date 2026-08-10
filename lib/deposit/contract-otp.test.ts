import { describe, expect, it } from 'vitest'

import {
  createContractOtpCode,
  createContractOtpRecord,
  resolveContractOtpSecret,
  verifyContractOtpRecord,
} from './contract-otp'

const binding = {
  customerId: 'customer-1',
  orderId: 'order-1',
  documentId: 'document-1',
  contentHash: 'a'.repeat(64),
}

describe('contract OTP', () => {
  it('generates a six-digit code', () => {
    expect(createContractOtpCode()).toMatch(/^\d{6}$/)
  })

  it('binds the code to customer, order, document and content hash', () => {
    const secret = 's'.repeat(32)
    const record = createContractOtpRecord(binding, '123456', secret)

    expect(verifyContractOtpRecord(record, binding, '123456', secret)).toBe(true)
    expect(verifyContractOtpRecord(record, binding, '654321', secret)).toBe(false)
    expect(verifyContractOtpRecord(record, { ...binding, documentId: 'document-2' }, '123456', secret)).toBe(false)
    expect(verifyContractOtpRecord(record, { ...binding, contentHash: 'b'.repeat(64) }, '123456', secret)).toBe(false)
  })

  it('rejects expired or modified issue timestamps', () => {
    const secret = 's'.repeat(32)
    const issuedAt = new Date('2026-08-10T00:00:00.000Z')
    const record = createContractOtpRecord(binding, '123456', secret, issuedAt)

    expect(verifyContractOtpRecord(record, binding, '123456', secret, new Date('2026-08-10T00:04:59.000Z'))).toBe(true)
    expect(verifyContractOtpRecord(record, binding, '123456', secret, new Date('2026-08-10T00:05:01.000Z'))).toBe(false)
    expect(verifyContractOtpRecord({ ...record, issuedAt: '2026-08-10T00:00:01.000Z' }, binding, '123456', secret, new Date('2026-08-10T00:01:00.000Z'))).toBe(false)
  })

  it('requires at least 32 characters of server-only key material', () => {
    expect(resolveContractOtpSecret({ CONTRACT_OTP_SECRET: 'short' })).toBeNull()
    expect(resolveContractOtpSecret({ AUTH0_SECRET: 'a'.repeat(32) })).toBe('a'.repeat(32))
    expect(resolveContractOtpSecret({ CONTRACT_OTP_SECRET: 'b'.repeat(32), AUTH0_SECRET: 'a'.repeat(32) })).toBe('b'.repeat(32))
  })
})
