import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  updateSession: vi.fn(),
  findUserByAuth0Subject: vi.fn(),
  findUserByEmail: vi.fn(),
  getCurrentUser: vi.fn(),
}))

vi.mock('@/lib/auth0', () => ({
  auth0: {
    getSession: mocks.getSession,
    updateSession: mocks.updateSession,
  },
}))
vi.mock('@/lib/services/user-service', () => ({
  findUserByAuth0Subject: mocks.findUserByAuth0Subject,
  findUserByEmail: mocks.findUserByEmail,
}))
vi.mock('@/lib/auth/current-user', () => ({
  getCurrentUser: mocks.getCurrentUser,
}))

import { requireCurrentCartCustomerId } from './customer'

const localUser = {
  id: '204e71df-2f26-4a9b-b0fe-3eb9082953f1',
  auth0_subject: 'auth0|user-1',
  email: 'customer@example.com',
  full_name: 'Customer',
  phone_number: null,
  role: 'CUSTOMER' as const,
  status: 'ACTIVE' as const,
  email_verified: true,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-28T00:00:00.000Z',
}

const session = {
  user: { sub: 'auth0|user-1', email: localUser.email, email_verified: true },
  tokenSet: { accessToken: 'test', expiresAt: 1 },
  internal: { sid: 'sid-1', createdAt: 1 },
}

describe('requireCurrentCartCustomerId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updateSession.mockResolvedValue(undefined)
  })

  it('uses the session local user ID without a users query', async () => {
    mocks.getSession.mockResolvedValue({ ...session, localUserId: localUser.id })

    await expect(requireCurrentCartCustomerId()).resolves.toBe(localUser.id)
    expect(mocks.findUserByAuth0Subject).not.toHaveBeenCalled()
    expect(mocks.findUserByEmail).not.toHaveBeenCalled()
  })

  it('hydrates a legacy session once and persists the local ID', async () => {
    mocks.getSession.mockResolvedValue(session)
    mocks.findUserByAuth0Subject.mockResolvedValue(localUser)

    await expect(requireCurrentCartCustomerId()).resolves.toBe(localUser.id)
    expect(mocks.findUserByAuth0Subject).toHaveBeenCalledWith('auth0|user-1')
    expect(mocks.updateSession).toHaveBeenCalledWith({
      ...session,
      localUserId: localUser.id,
    })
  })

  it('rejects an inactive legacy local user', async () => {
    mocks.getSession.mockResolvedValue(session)
    mocks.findUserByAuth0Subject.mockResolvedValue({ ...localUser, status: 'INACTIVE' })

    await expect(requireCurrentCartCustomerId()).rejects.toMatchObject({
      status: 401,
      code: 'AUTHENTICATION_REQUIRED',
    })
    expect(mocks.updateSession).not.toHaveBeenCalled()
  })
})
