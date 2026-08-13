import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const middleware = readFileSync(new URL('../../middleware.ts', import.meta.url), 'utf8')

describe('deployment Basic Auth middleware expiry', () => {
  it('does not silently renew an expired cookie from browser-cached credentials', () => {
    expect(middleware).toContain('if (basicAuthConfig.enabled && !hasValidCookie)')
    expect(middleware).not.toContain('hasValidCredentials')
    expect(middleware).not.toContain('createDeploymentBasicAuthCookie')
    expect(middleware).toContain('PREVIEW_AUTH_RETRY_PATH')
    expect(middleware).not.toContain('/__preview-auth/retry')
    expect(middleware).toContain('/api/preview-auth/session')
    expect(middleware).toContain('PREVIEW_AUTH_REQUIRED_HEADER')
    expect(middleware).toContain('PREVIEW_AUTH_STATUS_PATH')
    expect(middleware).not.toContain('www-authenticate')
  })
})
