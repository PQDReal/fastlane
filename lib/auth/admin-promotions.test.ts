import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorizeAccessToken: vi.fn(),
  authorizeRequest: vi.fn(),
  getAccessToken: vi.fn(),
  getCurrentUser: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth0', () => ({
  auth0: { getAccessToken: mocks.getAccessToken },
}))
vi.mock('@/lib/auth/authorize', () => ({
  authorizeAccessToken: mocks.authorizeAccessToken,
  authorizeRequest: mocks.authorizeRequest,
}))
vi.mock('@/lib/auth/current-user', () => ({
  getCurrentUser: mocks.getCurrentUser,
}))

import {
  adminPromotionPolicy,
  authorizeAdminPromotionRequest,
} from '@/lib/auth/admin-promotions'

describe('Admin Promotion authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requires the admin role and promotion:manage permission', () => {
    expect(adminPromotionPolicy).toEqual({
      requiredRoles: ['admin'],
      requiredPermissions: ['promotion:manage'],
    })
  })

  it('authorizes bearer-token requests with the promotion policy', async () => {
    const request = new Request('http://localhost/api/v1/admin/promotions', {
      headers: { Authorization: 'Bearer token' },
    })
    mocks.authorizeRequest.mockResolvedValue({ subject: 'auth0|admin' })

    await authorizeAdminPromotionRequest(request)

    expect(mocks.authorizeRequest).toHaveBeenCalledWith(
      request,
      adminPromotionPolicy,
    )
    expect(mocks.getCurrentUser).not.toHaveBeenCalled()
  })

  it('authorizes an Admin dashboard session with its access token', async () => {
    const request = new Request('http://localhost/api/v1/admin/promotions')
    mocks.getCurrentUser.mockResolvedValue({
      id: 'user-1',
      role: 'ADMIN',
    })
    mocks.getAccessToken.mockResolvedValue({ token: 'access-token' })
    mocks.authorizeAccessToken.mockResolvedValue({
      subject: 'auth0|admin',
    })

    await authorizeAdminPromotionRequest(request)

    expect(mocks.authorizeAccessToken).toHaveBeenCalledWith(
      'access-token',
      adminPromotionPolicy,
    )
  })

  it('rejects an authenticated non-Admin before requesting a token', async () => {
    const request = new Request('http://localhost/api/v1/admin/promotions')
    mocks.getCurrentUser.mockResolvedValue({
      id: 'user-2',
      role: 'CUSTOMER',
    })

    await expect(
      authorizeAdminPromotionRequest(request),
    ).rejects.toMatchObject({
      status: 403,
      code: 'INSUFFICIENT_PERMISSION',
    })
    expect(mocks.getAccessToken).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated dashboard request', async () => {
    const request = new Request('http://localhost/api/v1/admin/promotions')
    mocks.getCurrentUser.mockResolvedValue(null)

    await expect(
      authorizeAdminPromotionRequest(request),
    ).rejects.toMatchObject({
      status: 401,
      code: 'AUTHENTICATION_REQUIRED',
    })
  })
})
