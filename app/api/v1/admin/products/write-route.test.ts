import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiAuthError } from '@/lib/auth/errors'

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  save: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/admin', () => ({ authorizeAdminCatalogRequest: mocks.authorize }))
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: vi.fn() }))
vi.mock('@/lib/catalog/admin-accessory-server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/catalog/admin-accessory-server')>()
  return { ...actual, saveAdminAccessoryProduct: mocks.save }
})

import { POST } from '@/app/api/v1/admin/products/route'

function payload() {
  return {
    categoryId: '11111111-1111-1111-1111-111111111111',
    primaryCollectionId: '22222222-2222-2222-2222-222222222222',
    modelCollectionIds: [],
    name: 'Ốp gương',
    slug: 'op-guong',
    description: 'Phụ kiện chính hãng.',
    isActive: true,
    serviceLabelIds: [],
    content: { schema: 'accessory_content_v1', sections: [] },
    optionGroups: [],
    variants: [{
      name: 'Mặc định',
      sku: 'ACC-001',
      originalPrice: 500000,
      salePrice: null,
      isActive: true,
      optionValues: {},
      imageUrls: [],
    }],
    productImageUrls: ['https://cdn.example.com/product.webp'],
  }
}

function request(body: unknown) {
  return new Request('http://localhost/api/v1/admin/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/v1/admin/products', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue(undefined)
    mocks.save.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      productType: 'ACCESSORY',
      isActive: true,
      updatedAt: '2026-07-31T05:00:00.000000+00:00',
    })
  })

  it('authorizes before processing the catalog write', async () => {
    mocks.authorize.mockRejectedValue(new ApiAuthError(403, 'INSUFFICIENT_PERMISSION', 'Forbidden'))

    const response = await POST(request(payload()))

    expect(response.status).toBe(403)
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('rejects the whole payload before persistence when a relation is invalid', async () => {
    const body = payload()
    body.variants[0].optionValues = { unknown: 'value' }

    const response = await POST(request(body))

    expect(response.status).toBe(400)
    expect(mocks.save).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'VALIDATION_FAILED',
        fields: [{ path: 'variants.0.optionValues.unknown', meta: { rule: 'VARIANT_GROUP_UNKNOWN' } }],
      },
    })
  })

  it('persists one validated accessory aggregate and returns 201', async () => {
    const response = await POST(request(payload()))

    expect(response.status).toBe(201)
    expect(mocks.save).toHaveBeenCalledTimes(1)
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ slug: 'op-guong' }), null)
    await expect(response.json()).resolves.toMatchObject({
      data: { productType: 'ACCESSORY', isActive: true },
    })
  })
})
