import { describe, expect, it } from 'vitest'

import {
  accessoryCatalogHref,
  accessoryPrimaryCategoryLabel,
  accessoryVehicleLabels,
  accessoryFitmentStatus,
  buildAccessoryFacets,
  filterAccessoryProducts,
  parseAccessoryFilters,
} from '@/lib/catalog/accessory-filters'
import type {
  CatalogCollectionMembership,
  CatalogProduct,
} from '@/lib/catalog/types'

function membership({
  id,
  kind,
  name,
  slug,
  displayOrder,
  vehicleFilterMode,
}: {
  id: string
  kind: 'CATEGORY' | 'MODEL'
  name: string
  slug: string
  displayOrder: number
  vehicleFilterMode?: 'NONE' | 'COLLECTION_MEMBERSHIP'
}): CatalogCollectionMembership {
  return {
    id: `membership-${id}`,
    sourceSystem: 'VINFAST_DEMANDWARE',
    isPrimary: kind === 'CATEGORY',
    firstSeenAt: '2026-07-27T00:00:00Z',
    lastSeenAt: '2026-07-27T00:00:00Z',
    metadata: {},
    collection: {
      id,
      parentId: kind === 'MODEL' ? 'category-car' : null,
      kind,
      sourceSystem: 'VINFAST_DEMANDWARE',
      sourceKey: id,
      slug,
      name,
      vehicleFilterMode: vehicleFilterMode
        ?? (kind === 'MODEL' ? 'COLLECTION_MEMBERSHIP' : 'NONE'),
      displayOrder,
      metadata: {},
      vehicleModel: kind === 'MODEL' ? {
        id: `model-${id}`,
        code: slug.replaceAll('-', '_').toUpperCase(),
        slug,
        name,
        vehicleKind: 'CAR',
        metadata: {},
      } : null,
    },
  }
}

const carCategory = membership({
  id: 'category-car', kind: 'CATEGORY', name: 'Phụ kiện ô tô điện',
  slug: 'phu-kien-o-to-dien', displayOrder: 20,
  vehicleFilterMode: 'COLLECTION_MEMBERSHIP',
})

const vf7Model = membership({
  id: 'model-vf-7', kind: 'MODEL', name: 'VF 7', slug: 'vf-7', displayOrder: 30,
})

function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: 'product-1',
    categoryId: null,
    category: null,
    name: 'Thảm sàn VF 7',
    slug: 'tham-san-vf-7',
    description: 'Bảo vệ nội thất',
    productType: 'ACCESSORY',
    displayedPrice: 900_000,
    content: {
      sourceCategory: 'Phụ kiện ô tô điện',
      categories: ['Phụ kiện ô tô điện'],
      compatibleModels: ['VF 7'],
      serviceLabels: ['Có lắp đặt'],
      policyNotes: null,
      specificationText: null,
      specifications: {},
    },
    collectionMemberships: [carCategory, vf7Model],
    legacyImageUrls: [],
    optionGroups: [],
    variants: [{
      id: 'variant-1', productId: 'product-1', sku: 'FLOOR-VF7', name: 'Mặc định',
      originalPrice: 900_000, salePrice: null, effectivePrice: 900_000,
      depositAmount: null, availableQuantity: 4, optionSignature: null,
      metadata: {}, selectedOptions: {}, selectedOptionDetails: [],
    }],
    media: { product: [], byVariant: {}, byOptionValue: {} },
    priceRange: { minimum: 900_000, maximum: 900_000 },
    availableQuantity: 4,
    ...overrides,
  }
}

describe('accessory filters', () => {
  it('parses supported URL values and drops retired price filters', () => {
    const filters = parseAccessoryFilters({
      q: '  thảm  ', vehicle: 'VF 7', stock: 'out-of-stock', sort: 'price-desc',
      minPrice: '1000000', maxPrice: '500000',
    })
    expect(filters).toMatchObject({
      query: 'thảm', vehicle: 'VF 7', stock: 'all', sort: 'price-desc',
    })
    expect(accessoryCatalogHref(filters)).toContain('vehicle=VF+7')
    expect(accessoryCatalogHref(filters)).not.toContain('Price')
  })

  it('filters Vietnamese product names, fitment, service and stock then sorts', () => {
    const other = product({
      id: 'product-2', name: 'Cáp sạc VF 8', slug: 'cap-sac-vf-8',
      displayedPrice: 2_000_000,
      priceRange: { minimum: 2_000_000, maximum: 2_000_000 },
      content: {
        ...product().content,
        compatibleModels: ['VF 8'],
        serviceLabels: [],
      },
      collectionMemberships: [carCategory, membership({
        id: 'model-vf-8', kind: 'MODEL', name: 'VF 8', slug: 'vf-8', displayOrder: 20,
      })],
    })
    const filters = parseAccessoryFilters({
      q: 'tham', vehicle: 'VF 7', service: 'Có lắp đặt',
      stock: 'in-stock', sort: 'price-desc',
    })
    expect(filterAccessoryProducts([other, product()], filters).map((item) => item.id))
      .toEqual(['product-1'])
  })

  it('searches product names only, not SKU or descriptions', () => {
    expect(filterAccessoryProducts(
      [product()],
      parseAccessoryFilters({ q: 'FLOOR-VF7' }),
    )).toEqual([])
    expect(filterAccessoryProducts(
      [product()],
      parseAccessoryFilters({ q: 'Bảo vệ nội thất' }),
    )).toEqual([])
  })

  it('requires every selected service with AND semantics', () => {
    const showroom = product({
      id: 'product-showroom',
      name: 'Phụ kiện nhận tại showroom',
      content: {
        ...product().content,
        serviceLabels: ['Nhận tại showroom'],
      },
    })
    const fullService = product({
      id: 'product-full-service',
      name: 'Phụ kiện đủ dịch vụ',
      content: {
        ...product().content,
        serviceLabels: ['Có lắp đặt', 'Nhận tại showroom'],
      },
    })
    const filters = parseAccessoryFilters({
      service: ['Có lắp đặt', 'Nhận tại showroom'],
    })

    expect(filters.services).toEqual(['Có lắp đặt', 'Nhận tại showroom'])
    expect(filterAccessoryProducts(
      [product(), showroom, fullService],
      filters,
    ).map((item) => item.id)).toEqual(['product-full-service'])
    expect(accessoryCatalogHref(filters)).toContain(
      'service=C%C3%B3+l%E1%BA%AFp+%C4%91%E1%BA%B7t&service=Nh%E1%BA%ADn+t%E1%BA%A1i+showroom',
    )
  })

  it('derives real facets and distinguishes unknown fitment', () => {
    const base = product()
    expect(accessoryPrimaryCategoryLabel(base)).toBe('Phụ kiện ô tô điện')
    expect(accessoryVehicleLabels(base)).toEqual(['VF 7'])
    expect(buildAccessoryFacets([base]).vehicles).toEqual([{
      value: 'VF 7', label: 'VF 7', count: 1,
    }])
    expect(buildAccessoryFacets([base]).vehicleRelevantCategories)
      .toEqual(['Phụ kiện ô tô điện'])
    expect(buildAccessoryFacets([base]).vehiclesByCategory).toEqual({
      'Phụ kiện ô tô điện': [{ value: 'VF 7', label: 'VF 7', count: 1 }],
    })
    expect(accessoryFitmentStatus(base, 'VF 7')).toBe('compatible')
    expect(accessoryFitmentStatus(base, 'VF 8')).toBe('incompatible')
    expect(accessoryFitmentStatus(product({
      content: { ...base.content, compatibleModels: [] },
      collectionMemberships: [carCategory],
    }), 'VF 8')).toBe('unknown')
  })

  it('does not apply a vehicle filter to a vehicle-independent category', () => {
    const lifestyle = product({
      id: 'lifestyle-product',
      content: {
        ...product().content,
        sourceCategory: 'Phong cách sống',
        categories: ['Phong cách sống'],
        compatibleModels: [],
      },
      collectionMemberships: [membership({
        id: 'category-lifestyle', kind: 'CATEGORY', name: 'Phong cách sống',
        slug: 'phong-cach-song', displayOrder: 10,
      })],
    })
    const filters = parseAccessoryFilters({
      category: 'Phong cách sống',
      vehicle: 'VF 7',
    })

    expect(filterAccessoryProducts([product(), lifestyle], filters).map((item) => item.id))
      .toEqual(['lifestyle-product'])
    expect(buildAccessoryFacets([product(), lifestyle]).vehicleRelevantCategories)
      .not.toContain('Phong cách sống')
  })

  it('keeps products without a price last for both price sorts', () => {
    const priced = product()
    const withoutPrice = product({
      id: 'product-without-price',
      name: 'Chưa có giá',
      displayedPrice: null,
      priceRange: null,
    })

    for (const sort of ['price-asc', 'price-desc'] as const) {
      const filters = parseAccessoryFilters({ sort })
      expect(filterAccessoryProducts([withoutPrice, priced], filters).at(-1)?.id)
        .toBe('product-without-price')
    }
  })
})
