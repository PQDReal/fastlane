import { describe, expect, it } from 'vitest'

import {
  createPreviewAuthRetryHref,
  isPreviewAuthRequiredResponse,
  PREVIEW_AUTH_REQUIRED_CODE,
  PREVIEW_AUTH_REQUIRED_HEADER,
  PREVIEW_AUTH_EXPIRY_STORAGE_KEY,
  PREVIEW_AUTH_STATUS_PATH,
} from './preview-auth-protocol'

describe('preview auth expiry protocol', () => {
  it('recognizes only a 401 marked as an expired preview session', () => {
    const expired = new Response(null, {
      status: 401,
      headers: { [PREVIEW_AUTH_REQUIRED_HEADER]: PREVIEW_AUTH_REQUIRED_CODE },
    })
    const ordinaryUnauthorized = new Response(null, { status: 401 })

    expect(isPreviewAuthRequiredResponse(expired)).toBe(true)
    expect(isPreviewAuthRequiredResponse(ordinaryUnauthorized)).toBe(false)
  })

  it('keeps the complete current URL as the post-authentication destination', () => {
    expect(createPreviewAuthRetryHref({
      pathname: '/profile',
      search: '?tab=orders',
      hash: '#FL-123',
    })).toBe('/preview-auth/retry?returnTo=%2Fprofile%3Ftab%3Dorders%23FL-123')
  })

  it('uses a namespaced key for the non-sensitive client expiry timestamp', () => {
    expect(PREVIEW_AUTH_EXPIRY_STORAGE_KEY).toBe('fastlane:preview-auth-expires-at')
    expect(PREVIEW_AUTH_STATUS_PATH).toBe('/api/preview-auth/status')
  })
})
