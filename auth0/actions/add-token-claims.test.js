import { createRequire } from 'node:module'

import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { onExecutePostLogin } = require('./add-token-claims')

function harness({ namespace = 'https://fastlane.test/roles', roles } = {}) {
  const api = {
    access: { deny: vi.fn() },
    accessToken: { setCustomClaim: vi.fn() },
    idToken: { setCustomClaim: vi.fn() },
  }
  const event = {
    authorization: roles === undefined ? undefined : { roles },
    secrets: { ROLE_CLAIM_NAMESPACE: namespace },
  }

  return { api, event }
}

describe('FastLane Auth0 Post-Login Action', () => {
  it('normalizes and de-duplicates supported roles', async () => {
    const { api, event } = harness({
      namespace: 'https://fastlane.test/roles',
      roles: ['Customer', 'CUSTOMER', 'unknown'],
    })

    await onExecutePostLogin(event, api)

    expect(api.access.deny).not.toHaveBeenCalled()
    expect(api.accessToken.setCustomClaim).toHaveBeenCalledWith(
      'https://fastlane.test/roles',
      ['customer'],
    )
    expect(api.idToken.setCustomClaim).toHaveBeenCalledWith(
      'role',
      'authenticated',
    )
  })

  it('denies login when the claim namespace is invalid', async () => {
    const { api, event } = harness({ namespace: 'not-a-url', roles: ['Customer'] })

    await onExecutePostLogin(event, api)

    expect(api.access.deny).toHaveBeenCalledOnce()
    expect(api.accessToken.setCustomClaim).not.toHaveBeenCalled()
  })

  it('denies login when no supported application role is assigned', async () => {
    const { api, event } = harness({ roles: ['unknown'] })

    await onExecutePostLogin(event, api)

    expect(api.access.deny).toHaveBeenCalledWith(
      'A FastLane Customer or Admin role is required.',
    )
    expect(api.idToken.setCustomClaim).not.toHaveBeenCalled()
  })
})
