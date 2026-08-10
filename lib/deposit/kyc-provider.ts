import { randomUUID } from 'crypto'

export const FASTLANE_TEST_PROVIDER = 'fastlane-test'
export type FastlaneTestKycResult = 'approved' | 'declined' | 'review'

export function getKycProvider() {
  return process.env.KYC_PROVIDER?.trim().toLowerCase() || 'didit'
}

export function isFastlaneTestProvider() {
  return getKycProvider() === FASTLANE_TEST_PROVIDER
}

export function assertFastlaneTestAllowed() {
  if (isFastlaneTestProvider() && process.env.NODE_ENV === 'production') {
    throw new Error('Provider fastlane-test chỉ được phép dùng ngoài production.')
  }
}

export function createFastlaneTestSession() {
  assertFastlaneTestAllowed()
  return `fastlane-test:${randomUUID()}`
}

export function getFastlaneTestResult(): FastlaneTestKycResult {
  const result = process.env.FASTLANE_TEST_KYC_RESULT?.trim().toLowerCase()
  return result === 'declined' || result === 'review' ? result : 'approved'
}

export function buildFastlaneTestDecision(order: {
  full_name: string | null
  id_card_number: string | null
}) {
  return {
    status: getFastlaneTestResult(),
    document: {
      first_name: order.full_name || '',
      last_name: '',
      document_number: order.id_card_number || '',
    },
  }
}
