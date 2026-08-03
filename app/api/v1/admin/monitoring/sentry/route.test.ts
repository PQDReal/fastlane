import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiAuthError } from '@/lib/auth/errors'

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), getData: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/admin', () => ({ authorizeAdminCatalogRequest: mocks.authorize }))
vi.mock('@/lib/services/sentry-monitoring-service', () => ({ getSentryMonitoringData: mocks.getData }))

import { GET } from '@/app/api/v1/admin/monitoring/sentry/route'

describe('Admin Sentry monitoring API', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.authorize.mockResolvedValue(undefined) })

  it('requires admin authorization', async () => {
    mocks.authorize.mockRejectedValue(new ApiAuthError(403, 'INSUFFICIENT_PERMISSION', 'Admin required.'))
    const response = await GET(new Request('http://localhost/api/v1/admin/monitoring/sentry'))
    expect(response.status).toBe(403)
    expect(mocks.getData).not.toHaveBeenCalled()
  })

  it('rejects an unsupported period', async () => {
    const response = await GET(new Request('http://localhost/api/v1/admin/monitoring/sentry?period=30d'))
    expect(response.status).toBe(400)
    expect(mocks.getData).not.toHaveBeenCalled()
  })

  it('returns cached monitoring data for the selected period', async () => {
    mocks.getData.mockResolvedValue({ configured: true, available: true, period: '7d' })
    const response = await GET(new Request('http://localhost/api/v1/admin/monitoring/sentry?period=7d'))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ data: { configured: true, available: true, period: '7d' } })
    expect(mocks.getData).toHaveBeenCalledWith('7d')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
})
