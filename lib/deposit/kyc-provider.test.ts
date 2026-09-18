import { describe, expect, it, vi } from 'vitest'
import {
  buildFastlaneTestDecision,
  createFastlaneTestSession,
  getFastlaneTestResult,
} from './kyc-provider'

describe('fastlane-test KYC provider', () => {
  it('creates a namespaced mock session', () => {
    vi.stubEnv('NODE_ENV', 'test')
    expect(createFastlaneTestSession()).toMatch(/^fastlane-test:/)
  })

  it('defaults to an approved decision and mirrors order identity', () => {
    vi.stubEnv('FASTLANE_TEST_KYC_RESULT', '')
    const decision = buildFastlaneTestDecision({ full_name: 'Nguyễn Văn A', id_card_number: '012345678901' })
    expect(decision.status).toBe('approved')
    expect(decision.document.document_number).toBe('012345678901')
  })

  it.each(['declined', 'review'] as const)('supports %s test outcomes', (result) => {
    vi.stubEnv('FASTLANE_TEST_KYC_RESULT', result)
    expect(getFastlaneTestResult()).toBe(result)
  })
})
