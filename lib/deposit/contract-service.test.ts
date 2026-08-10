import { describe, expect, it } from 'vitest'
import { getAutoIssueReadiness } from './contract-workflow'

describe('getAutoIssueReadiness', () => {
  const valid = {
    status: 'CONFIRMED',
    kycStatus: 'APPROVED',
    vehicleType: 'car',
    hasPaidDeposit: true,
  }

  it('requires all approval, KYC, vehicle and payment gates', () => {
    expect(getAutoIssueReadiness(valid)).toBe('READY')
    expect(getAutoIssueReadiness({ ...valid, status: 'PENDING_CONFIRMATION' })).toBe('NOT_READY')
    expect(getAutoIssueReadiness({ ...valid, kycStatus: 'REVIEW' })).toBe('NOT_READY')
    expect(getAutoIssueReadiness({ ...valid, vehicleType: 'motorbike' })).toBe('READY')
    expect(getAutoIssueReadiness({ ...valid, hasPaidDeposit: false })).toBe('NOT_READY')
  })
})
