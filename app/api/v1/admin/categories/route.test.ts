import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiAuthError } from '@/lib/auth/errors'

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/admin', () => ({
  authorizeAdminCatalogRequest: mocks.authorize,
}))
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}))

import { GET } from '@/app/api/v1/admin/categories/route'

function request() {
  return new Request('http://localhost/api/v1/admin/categories')
}

describe('Admin categories API timing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue(undefined)
  })

  it('includes route timing when authorization fails', async () => {
    mocks.authorize.mockRejectedValue(
      new ApiAuthError(403, 'INSUFFICIENT_PERMISSION', 'Forbidden'),
    )

    const response = await GET(request())
    const serverTiming = response.headers.get('server-timing') ?? ''

    expect(response.status).toBe(403)
    expect(serverTiming).toMatch(/authorization;dur=\d+\.\d/)
    expect(serverTiming).toMatch(/route;dur=\d+\.\d/)
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled()
  })

  it('measures authorization, categories query, and transformation', async () => {
    const query = {
      select: vi.fn(),
      order: vi.fn(),
    }
    query.select.mockReturnValue(query)
    query.order.mockResolvedValue({
      data: [{
        id: 'category-1',
        name: 'Ô tô điện',
        slug: 'cars',
        description: null,
        is_active: true,
        created_at: '2026-08-17T00:00:00.000Z',
        updated_at: '2026-08-17T00:00:00.000Z',
      }],
      error: null,
    })
    mocks.getSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue(query),
    })

    const response = await GET(request())
    const serverTiming = response.headers.get('server-timing') ?? ''

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([expect.objectContaining({
      id: 'category-1',
      isActive: true,
    })])
    expect(mocks.authorize).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({ measure: expect.any(Function) }),
    )
    expect(serverTiming).toMatch(/authorization;dur=\d+\.\d/)
    expect(serverTiming).toMatch(/db_categories;dur=\d+\.\d/)
    expect(serverTiming).toMatch(/transform;dur=\d+\.\d/)
    expect(serverTiming).toMatch(/route;dur=\d+\.\d/)
  })
})
