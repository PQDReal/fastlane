import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSession: vi.fn(),
  updateSession: vi.fn(),
  updateAuth0UsersByEmail: vi.fn(),
  updateUserProfile: vi.fn(),
}))

vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: mocks.getCurrentUser }))
vi.mock('@/lib/auth0', () => ({
  auth0: { getSession: mocks.getSession, updateSession: mocks.updateSession },
}))
vi.mock('@/lib/auth0-management', () => ({
  updateAuth0UsersByEmail: mocks.updateAuth0UsersByEmail,
}))
vi.mock('@/lib/services/user-service', () => ({ updateUserProfile: mocks.updateUserProfile }))

import { GET, PATCH } from './route'

const localUser = {
  id: 'user-1',
  auth0_subject: 'auth0|primary',
  email: 'customer@example.com',
  full_name: 'Old Name',
  phone_number: '0901234567',
  role: 'CUSTOMER',
  status: 'ACTIVE',
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-28T00:00:00.000Z',
}

describe('PATCH /api/v1/users/me', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCurrentUser.mockResolvedValue(localUser)
    mocks.getSession.mockResolvedValue({
      user: { sub: 'google-oauth2|current', name: 'Old Name' },
      tokenSet: {},
      internal: {},
    })
    mocks.updateAuth0UsersByEmail.mockResolvedValue(undefined)
    mocks.updateSession.mockResolvedValue(undefined)
  })

  it('updates the current Auth0 identity and refreshes the session name', async () => {
    const updatedUser = { ...localUser, full_name: 'New Name' }
    mocks.updateUserProfile.mockResolvedValue(updatedUser)

    const response = await PATCH(new Request('http://localhost/api/v1/users/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fullName: 'New Name' }),
    }))

    expect(response.status).toBe(200)
    expect(mocks.updateAuth0UsersByEmail).toHaveBeenCalledWith(
      localUser.email,
      'google-oauth2|current',
      {
        fullName: 'New Name',
        phoneNumber: undefined,
      },
    )
    expect(mocks.updateSession).toHaveBeenCalledWith(expect.objectContaining({
      user: expect.objectContaining({ name: 'New Name' }),
    }))
  })

  it('does not send the unchanged name when only the phone number changes', async () => {
    const updatedUser = { ...localUser, phone_number: '0987654321' }
    mocks.updateUserProfile.mockResolvedValue(updatedUser)

    const response = await PATCH(new Request('http://localhost/api/v1/users/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fullName: localUser.full_name,
        phoneNumber: '0987654321',
      }),
    }))

    expect(response.status).toBe(200)
    expect(mocks.updateAuth0UsersByEmail).toHaveBeenCalledWith(
      localUser.email,
      'google-oauth2|current',
      {
        fullName: undefined,
        phoneNumber: '0987654321',
      },
    )
  })})

describe('GET /api/v1/users/me timing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCurrentUser.mockResolvedValue(localUser)
  })

  it('returns profile data with authentication and route timing', async () => {
    const response = await GET()
    const serverTiming = response.headers.get('server-timing') ?? ''

    expect(response.status).toBe(200)
    expect(mocks.getCurrentUser).toHaveBeenCalledWith(
      expect.objectContaining({ measure: expect.any(Function) }),
    )
    expect(serverTiming).toMatch(/authentication;dur=\d+\.\d/)
    expect(serverTiming).toMatch(/transform;dur=\d+\.\d/)
    expect(serverTiming).toMatch(/route;dur=\d+\.\d/)
  })
})
