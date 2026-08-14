import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ listAccessoryCatalog: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/catalog/server', () => ({ listAccessoryCatalog: mocks.listAccessoryCatalog }))

import { discoverSalesAgentAccessories } from './accessories'

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    categoryId: 'category-1',
    category: { id: 'category-1', name: 'Sạc', slug: 'sac' },
    name: 'Sạc treo tường',
    slug: 'sac-treo-tuong',
    description: 'Sạc tại nhà cho xe điện.',
    productType: 'ACCESSORY',
    displayedPrice: 10_000_000,
    createdAt: '2026-08-12T00:00:00.000Z',
    content: { schema: 'accessory_content_v1', sections: [] },
    serviceLabels: [],
    collectionMemberships: [],
    legacyImageUrls: [],
    optionGroups: [],
    variants: [],
    media: { product: [], byVariant: {}, byOptionValue: {} },
    priceRange: { minimum: 10_000_000, maximum: 10_000_000 },
    availableQuantity: 0,
    ...overrides,
  }
}

function catalog(products: unknown[]) {
  return { products, serviceLabels: [], page: 1, pageSize: 100, total: products.length, totalPages: 1, facets: {} }
}

describe('sales agent accessory discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listAccessoryCatalog.mockResolvedValue(catalog([]))
  })

  it('marks collection membership as catalog association, never verified fitment', async () => {
    mocks.listAccessoryCatalog.mockResolvedValue(catalog([product({
      name: 'Thảm sàn VF 8',
      slug: 'tham-san-vf-8',
      collectionMemberships: [{
        id: 'membership-1', sourceSystem: 'admin', isPrimary: true,
        firstSeenAt: '2026-08-12T00:00:00.000Z', lastSeenAt: '2026-08-12T00:00:00.000Z', metadata: {},
        collection: { id: 'collection-1', parentId: null, kind: 'MODEL', sourceSystem: 'admin', sourceKey: 'vf8', slug: 'vf8', name: 'VF 8', vehicleFilterMode: 'COLLECTION_MEMBERSHIP', displayOrder: 0, metadata: {}, vehicleModel: null },
      }],
    })]))

    const result = await discoverSalesAgentAccessories({ query: 'VF 8' })

    expect(result.items[0]?.associationStatus).toBe('CATALOG_ASSOCIATION')
    expect(JSON.stringify(result)).not.toContain('VERIFIED_FITMENT')
  })

  it('returns unknown association and an explicit mapping warning for a vehicle product', async () => {
    mocks.listAccessoryCatalog.mockResolvedValue(catalog([product()]))

    const result = await discoverSalesAgentAccessories({ vehicleProductId: 'p1' })

    expect(result.items[0]?.associationStatus).toBe('UNKNOWN')
    expect(result.items[0]).toMatchObject({ isActive: true, url: '/accessories/sac-treo-tuong' })
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'VEHICLE_MODEL_MAPPING_MISSING' }))
  })

  it('reuses the public accessory catalog repository instead of a parallel inventory query', async () => {
    await discoverSalesAgentAccessories({})

    expect(mocks.listAccessoryCatalog).toHaveBeenCalledWith({ page: 1, pageSize: 100 })
  })

  it('loads every public catalog page when active accessories exceed one page', async () => {
    mocks.listAccessoryCatalog
      .mockResolvedValueOnce({ ...catalog([product()]), total: 101, totalPages: 2 })
      .mockResolvedValueOnce({ ...catalog([product({ id: 'a2', name: 'Thảm sàn', slug: 'tham-san' })]), page: 2, total: 101, totalPages: 2 })

    const result = await discoverSalesAgentAccessories({ limit: 8 })

    expect(mocks.listAccessoryCatalog).toHaveBeenNthCalledWith(2, { page: 2, pageSize: 100 })
    expect(result.items.map((item) => item.productId)).toEqual(['a1', 'a2'])
  })

  it('returns useful active product facts without inventory warnings', async () => {
    mocks.listAccessoryCatalog.mockResolvedValue(catalog([product({
      serviceLabels: [{ id: 'service-1', code: 'install', name: 'Lắp đặt', description: null, displayOrder: 0, isActive: true, assignmentCount: 1 }],
      content: { schema: 'accessory_content_v1', sections: [{ key: 'features', type: 'FEATURES', title: 'Tính năng', displayOrder: 0, body: 'Sạc tiện lợi tại nhà', items: [], attributes: [] }] },
    })]))

    const result = await discoverSalesAgentAccessories({ limit: 1 })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.facts).toMatchObject({ category: 'Sạc', services: 'Lắp đặt' })
    expect(result.warnings).toEqual([])
    expect(JSON.stringify(result)).not.toContain('availableQuantity')
  })

  it('returns active alternatives when a broad keyword has no exact catalog match', async () => {
    mocks.listAccessoryCatalog.mockResolvedValue(catalog([product()]))

    const result = await discoverSalesAgentAccessories({ query: 'an toàn thiết yếu', limit: 4 })

    expect(result.items).toHaveLength(1)
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'NO_EXACT_ACCESSORY_MATCH' }))
  })
})
