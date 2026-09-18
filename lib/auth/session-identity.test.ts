import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  isLocalUserId,
  readLocalUserId,
  withLocalUserId,
} from './session-identity'

const session = {
  user: { sub: 'auth0|user-1' },
  tokenSet: { accessToken: 'test-token', expiresAt: 1 },
  internal: { sid: 'sid-1', createdAt: 1 },
}

describe('Auth0 session local identity', () => {
  it('accepts and reads only UUID local user IDs', () => {
    const localUserId = '204e71df-2f26-4a9b-b0fe-3eb9082953f1'
    expect(isLocalUserId(localUserId)).toBe(true)
    expect(readLocalUserId(withLocalUserId(session, localUserId))).toBe(localUserId)
    expect(readLocalUserId({ ...session, localUserId: 'not-a-uuid' })).toBeNull()
  })

  it('does not expose a missing or malformed session identity as a customer ID', () => {
    expect(readLocalUserId(null)).toBeNull()
    expect(readLocalUserId({ ...session, localUserId: 42 })).toBeNull()
    expect(isLocalUserId('')).toBe(false)
  })
})
