import { describe, expect, it } from 'vitest'

import {
  decryptDepositDraft,
  encryptDepositDraft,
} from '@/lib/deposit/draft-crypto'

const secret = 'a-secure-test-secret-with-more-than-32-characters'

describe('encrypted deposit drafts', () => {
  it('round-trips JSON without exposing plaintext PII', () => {
    const payload = { name: 'Nguyễn Văn A', idCard: '012345678901' }
    const encrypted = encryptDepositDraft(payload, secret, 'auth0|customer-a')

    expect(JSON.stringify(encrypted)).not.toContain(payload.name)
    expect(JSON.stringify(encrypted)).not.toContain(payload.idCard)
    expect(decryptDepositDraft(encrypted, secret, 'auth0|customer-a')).toEqual(payload)
  })

  it('cannot be decrypted by another account or after tampering', () => {
    const encrypted = encryptDepositDraft({ phone: '0901234567' }, secret, 'auth0|customer-a')
    expect(() => decryptDepositDraft(encrypted, secret, 'auth0|customer-b')).toThrow()
    expect(() => decryptDepositDraft({
      ...encrypted,
      ciphertext: `${encrypted.ciphertext[0] === 'A' ? 'B' : 'A'}${encrypted.ciphertext.slice(1)}`,
    }, secret, 'auth0|customer-a')).toThrow()
  })
})
