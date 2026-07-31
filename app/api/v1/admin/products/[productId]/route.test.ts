import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  load: vi.fn(),
  save: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/admin', () => ({ authorizeAdminCatalogRequest: mocks.authorize }))
vi.mock('@/lib/catalog/admin-accessory-server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/catalog/admin-accessory-server')>()
  return {
    ...actual,
    loadAdminAccessoryProduct: mocks.load,
    saveAdminAccessoryProduct: mocks.save,
  }
})

import { GET, PATCH } from '@/app/api/v1/admin/products/[productId]/route'

const PRODUCT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

function context(productId = PRODUCT_ID) {
  return { params: Promise.resolve({ productId }) }
}

function payload() {
  return {
    expectedUpdatedAt: '2026-07-31T05:00:00.123456+00:00',
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

describe('/api/v1/admin/products/{productId}', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue(undefined)
  })

  it('rejects malformed IDs before reading the database', async () => {
    const response = await GET(new Request('http://localhost/api/v1/admin/products/bad'), context('bad'))

    expect(response.status).toBe(400)
    expect(mocks.load).not.toHaveBeenCalled()
  })

  it('returns the editor projection for old normalized products', async () => {
    mocks.load.mockResolvedValue({ id: PRODUCT_ID, productType: 'ACCESSORY', isActive: true, updatedAt: 'version', draft: {} })

    const response = await GET(new Request(`http://localhost/api/v1/admin/products/${PRODUCT_ID}`), context())

    expect(response.status).toBe(200)
    expect(mocks.load).toHaveBeenCalledWith(PRODUCT_ID)
    await expect(response.json()).resolves.toMatchObject({ data: { id: PRODUCT_ID } })
  })

  it('requires an optimistic edit version before persistence', async () => {
    const body = payload()
    delete (body as Partial<typeof body>).expectedUpdatedAt
    const response = await PATCH(new Request(`http://localhost/api/v1/admin/products/${PRODUCT_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }), context())

    expect(response.status).toBe(400)
    expect(mocks.save).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'VALIDATION_FAILED',
        fields: [{ path: 'expectedUpdatedAt', meta: { rule: 'EXPECTED_UPDATED_AT_REQUIRED' } }],
      },
    })
  })

  it('passes a fully validated aggregate to the update transaction', async () => {
    mocks.save.mockResolvedValue({ id: PRODUCT_ID, productType: 'ACCESSORY', isActive: true, updatedAt: 'next-version' })
    const response = await PATCH(new Request(`http://localhost/api/v1/admin/products/${PRODUCT_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload()),
    }), context())

    expect(response.status).toBe(200)
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      expectedUpdatedAt: '2026-07-31T05:00:00.123456+00:00',
    }), PRODUCT_ID)
  })
})
