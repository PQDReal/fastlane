import { describe, expect, it } from 'vitest'

import {
  hasValidDeploymentBasicAuth,
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

  it('exempts only the exact VNPay GET callback', () => {
    expect(isDeploymentBasicAuthExempt('/api/v1/payments/vnpay/ipn', 'GET')).toBe(true)
    expect(isDeploymentBasicAuthExempt('/api/v1/payments/vnpay/ipn', 'POST')).toBe(false)
    expect(isDeploymentBasicAuthExempt('/api/v1/payments/vnpay/ipn/extra', 'GET')).toBe(false)
    expect(isDeploymentBasicAuthExempt('/api/webhooks/didit', 'POST')).toBe(false)
  })
})
