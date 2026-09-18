import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findUserById: vi.fn(),
  findUserByAuth0Subject: vi.fn(),
  findUserByEmail: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth0', () => ({ auth0: { getSession: mocks.getSession } }))
vi.mock('@/lib/services/user-service', () => ({
  findUserById: mocks.findUserById,
  findUserByAuth0Subject: mocks.findUserByAuth0Subject,
  findUserByEmail: mocks.findUserByEmail,
}))

import { getCurrentUser } from './current-user'

const activeUser = {
  id: '11111111-1111-4111-8111-111111111111',
  auth0_subject: 'auth0|user-1',
  email: 'user@example.com',
  full_name: 'User',
  phone_number: null,
  role: 'CUSTOMER',
  status: 'ACTIVE',
  email_verified: true,
  created_at: '2026-08-17T00:00:00.000Z',
  updated_at: '2026-08-17T00:00:00.000Z',
}

describe('getCurrentUser', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses the encrypted local user pointer before subject/email lookups', async () => {
    mocks.getSession.mockResolvedValue({
      localUserId: activeUser.id,
      user: { sub: activeUser.auth0_subject, email: activeUser.email },
    })
    mocks.findUserById.mockResolvedValue(activeUser)
    const timing = { measure: vi.fn() }

    await expect(getCurrentUser(timing)).resolves.toEqual(activeUser)
    expect(mocks.findUserById).toHaveBeenCalledWith(activeUser.id)
    expect(mocks.findUserByAuth0Subject).not.toHaveBeenCalled()
    expect(mocks.findUserByEmail).not.toHaveBeenCalled()
    expect(timing.measure).toHaveBeenCalledWith('auth_user_id', expect.any(Number))
  })

  it('falls back to subject lookup for sessions created before localUserId', async () => {
    mocks.getSession.mockResolvedValue({
      user: { sub: activeUser.auth0_subject, email: activeUser.email },
    })
    mocks.findUserByAuth0Subject.mockResolvedValue(activeUser)

    await expect(getCurrentUser()).resolves.toEqual(activeUser)
    expect(mocks.findUserById).not.toHaveBeenCalled()
    expect(mocks.findUserByAuth0Subject).toHaveBeenCalledWith(activeUser.auth0_subject)
  })

  it('does not authorize an inactive user resolved by id', async () => {
    mocks.getSession.mockResolvedValue({
      localUserId: activeUser.id,
      user: { sub: activeUser.auth0_subject, email: activeUser.email },
    })
    mocks.findUserById.mockResolvedValue({ ...activeUser, status: 'INACTIVE' })

    await expect(getCurrentUser()).resolves.toBeNull()
    expect(mocks.findUserByAuth0Subject).not.toHaveBeenCalled()
  })
})
