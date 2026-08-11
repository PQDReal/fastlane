import { describe, expect, it } from 'vitest'

import {
  createDeploymentBasicAuthCookie,
  hasValidDeploymentBasicAuth,
  hasValidDeploymentBasicAuthCookie,
  isDeploymentBasicAuthExempt,
  readDeploymentBasicAuthConfig,
} from './deployment-basic-auth'

describe('deployment Basic Auth', () => {
  it('is disabled unless explicitly enabled', () => {
    expect(readDeploymentBasicAuthConfig({} as NodeJS.ProcessEnv).enabled).toBe(false)
    expect(hasValidDeploymentBasicAuth(null, { enabled: false })).toBe(true)
  })

  it('fails closed when enabled without complete credentials', () => {
    expect(hasValidDeploymentBasicAuth(null, { enabled: true })).toBe(false)
    expect(hasValidDeploymentBasicAuth(`Basic ${btoa('preview:secret')}`, {
      enabled: true,
      username: 'preview',
    })).toBe(false)
  })

  it('accepts only the configured username and password', () => {
    const config = { enabled: true, username: 'preview', password: 'secret' }
    expect(hasValidDeploymentBasicAuth(`Basic ${btoa('preview:secret')}`, config)).toBe(true)
    expect(hasValidDeploymentBasicAuth(`Basic ${btoa('preview:wrong')}`, config)).toBe(false)
    expect(hasValidDeploymentBasicAuth('Bearer token', config)).toBe(false)
  })

  it('supports UTF-8 credentials without repeatedly rejecting the browser', () => {
    const credentials = Buffer.from('xem-trước:mật-khẩu-an-toàn', 'utf8').toString('base64')
    expect(hasValidDeploymentBasicAuth(`Basic ${credentials}`, {
      enabled: true,
      username: 'xem-trước',
      password: 'mật-khẩu-an-toàn',
    })).toBe(true)
  })

  it('creates a signed cookie shared by tabs and rejects tampering or expiry', async () => {
    const config = { enabled: true, username: 'preview', password: 'secret' }
    const now = 1_750_000_000
    const cookie = await createDeploymentBasicAuthCookie(config, now)

    expect(cookie).toBeTruthy()
    expect(await hasValidDeploymentBasicAuthCookie(cookie ?? undefined, config, now + 60)).toBe(true)
    expect(await hasValidDeploymentBasicAuthCookie(`${cookie}x`, config, now + 60)).toBe(false)
    expect(await hasValidDeploymentBasicAuthCookie(cookie ?? undefined, config, now + 1_801)).toBe(false)
    expect(await hasValidDeploymentBasicAuthCookie(cookie ?? undefined, {
      ...config,
      password: 'rotated-secret',
    }, now + 60)).toBe(false)
  })

  it('exempts only the exact independently authenticated endpoint methods', () => {
    expect(isDeploymentBasicAuthExempt('/api/v1/payments/vnpay/ipn', 'GET')).toBe(true)
    expect(isDeploymentBasicAuthExempt('/api/v1/payments/vnpay/ipn', 'POST')).toBe(false)
    expect(isDeploymentBasicAuthExempt('/api/v1/payments/vnpay/ipn/extra', 'GET')).toBe(false)
    expect(isDeploymentBasicAuthExempt('/api/webhooks/didit', 'POST')).toBe(true)
    expect(isDeploymentBasicAuthExempt('/api/webhooks/didit', 'GET')).toBe(false)
    expect(isDeploymentBasicAuthExempt('/api/webhooks/didit/extra', 'POST')).toBe(false)
    expect(isDeploymentBasicAuthExempt('/api/v1/deposit-orders/expire-contracts', 'POST')).toBe(true)
    expect(isDeploymentBasicAuthExempt('/api/v1/deposit-orders/expire-contracts', 'GET')).toBe(false)
    expect(isDeploymentBasicAuthExempt('/api/v1/deposit-orders/expire-contracts/extra', 'POST')).toBe(false)
  })
})
