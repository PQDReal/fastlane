import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUserByAuth0Subject: vi.fn(),
  getCurrentUser: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/services/user-service', () => ({
  findUserByAuth0Subject: mocks.findUserByAuth0Subject,
}))
vi.mock('@/lib/auth/current-user', () => ({
  getCurrentUser: mocks.getCurrentUser,
}))

import { requireAdminMutationIdentity } from '@/lib/auth/admin-mutation-identity'

const activeAdmin = {
  id: 'admin-1',
  auth0_subject: 'auth0|admin',
  email: 'admin@example.com',
  full_name: 'Admin',
  phone_number: null,
  role: 'ADMIN',
  status: 'ACTIVE',
  email_verified: true,
  created_at: '2026-08-10T00:00:00.000Z',
  updated_at: '2026-08-10T00:00:00.000Z',
} as const

describe('requireAdminMutationIdentity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses an active administrator linked to the authorized subject', async () => {
    mocks.findUserByAuth0Subject.mockResolvedValue(activeAdmin)

    await expect(requireAdminMutationIdentity(
      new Request('http://localhost/api/v1/admin/orders/order-1'),
      activeAdmin.auth0_subject,
    )).resolves.toEqual(activeAdmin)

    expect(mocks.getCurrentUser).not.toHaveBeenCalled()
  })

  it('uses the dashboard session email fallback when the subject is not linked yet', async () => {
    mocks.findUserByAuth0Subject.mockResolvedValue(null)
    mocks.getCurrentUser.mockResolvedValue(activeAdmin)

    await expect(requireAdminMutationIdentity(
      new Request('http://localhost/api/v1/admin/orders/order-1'),
      'auth0|new-subject',
    )).resolves.toEqual(activeAdmin)
  })

  it('does not mix a bearer identity with a dashboard session', async () => {
    mocks.findUserByAuth0Subject.mockResolvedValue(null)

    await expect(requireAdminMutationIdentity(
      new Request('http://localhost/api/v1/admin/orders/order-1', {
        headers: { Authorization: 'Bearer token' },
      }),
      'auth0|api-client',
    )).rejects.toMatchObject({
      status: 403,
      code: 'ADMIN_IDENTITY_REQUIRED',
    })

    expect(mocks.getCurrentUser).not.toHaveBeenCalled()
  })

  it('rejects a linked user who is not an active administrator', async () => {
    mocks.findUserByAuth0Subject.mockResolvedValue({
      ...activeAdmin,
      role: 'CUSTOMER',
    })

    await expect(requireAdminMutationIdentity(
      new Request('http://localhost/api/v1/admin/orders/order-1'),
      activeAdmin.auth0_subject,
    )).rejects.toMatchObject({
      status: 403,
      code: 'ADMIN_IDENTITY_REQUIRED',
    })

    expect(mocks.getCurrentUser).not.toHaveBeenCalled()
  })
})
