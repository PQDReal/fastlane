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

import { GET } from '@/app/api/v1/admin/catalog-collections/route'

const ROOT_CATEGORY_ID = '8cf65070-97a9-6eef-f6e8-af036a7aa946'

function request(rootCategoryId?: string) {
  const url = new URL('http://localhost/api/v1/admin/catalog-collections')
  if (rootCategoryId) url.searchParams.set('rootCategoryId', rootCategoryId)
  return new Request(url)
}

describe('Admin catalog collections API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue(undefined)
  })

  it('requires admin catalog authorization', async () => {
    mocks.authorize.mockRejectedValue(new ApiAuthError(403, 'INSUFFICIENT_PERMISSION', 'Forbidden'))

    const response = await GET(request(ROOT_CATEGORY_ID))

    expect(response.status).toBe(403)
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled()
  })

  it('requires a root category id', async () => {
    const response = await GET(request())

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Thiếu danh mục sản phẩm gốc.' })
  })

  it('rejects a malformed root category id', async () => {
    const response = await GET(request('not-a-uuid'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Danh mục sản phẩm gốc không hợp lệ.' })
  })

  it('returns active collections with their parent relationship', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
    }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    query.order
      .mockReturnValueOnce(query)
      .mockResolvedValueOnce({
        data: [{
          id: 'model-vf9',
          parent_id: 'parts-car',
          kind: 'MODEL',
          slug: 'vf-9',
          name: 'VF 9',
          display_order: 10,
        }],
        error: null,
      })
    const from = vi.fn().mockReturnValue(query)
    mocks.getSupabaseAdmin.mockReturnValue({ from })

    const response = await GET(request(ROOT_CATEGORY_ID))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([{
      id: 'model-vf9',
      parentId: 'parts-car',
      kind: 'MODEL',
      slug: 'vf-9',
      name: 'VF 9',
      displayOrder: 10,
    }])
    expect(from).toHaveBeenCalledWith('catalog_collections')
    expect(query.eq).toHaveBeenNthCalledWith(1, 'root_category_id', ROOT_CATEGORY_ID)
    expect(query.eq).toHaveBeenNthCalledWith(2, 'is_active', true)
  })
})
