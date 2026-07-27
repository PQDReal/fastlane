import { describe, expect, it } from 'vitest'

import {
  accessoryCatalogHref,
  accessoryFitmentStatus,
  buildAccessoryFacets,
  filterAccessoryProducts,
  parseAccessoryFilters,
} from '@/lib/catalog/accessory-filters'
import type { CatalogProduct } from '@/lib/catalog/types'

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
  it('parses bounded URL values and keeps canonical query names', () => {
    const filters = parseAccessoryFilters({
      q: '  thảm  ', vehicle: 'VF 7', stock: 'invalid', sort: 'price-desc',
      minPrice: '1000000', maxPrice: '500000',
    })
    expect(filters).toMatchObject({
      query: 'thảm', vehicle: 'VF 7', stock: 'all', sort: 'price-desc',
      minimumPrice: 1_000_000, maximumPrice: 1_000_000,
    })
    expect(accessoryCatalogHref(filters)).toContain('vehicle=VF+7')
  })

  it('filters Vietnamese text, fitment, service, stock and price then sorts', () => {
    const other = product({
      id: 'product-2', name: 'Cáp sạc VF 8', slug: 'cap-sac-vf-8',
      displayedPrice: 2_000_000,
      priceRange: { minimum: 2_000_000, maximum: 2_000_000 },
      content: {
        ...product().content,
        compatibleModels: ['VF 8'],
        serviceLabels: [],
      },
    })
    const filters = parseAccessoryFilters({
      q: 'tham', vehicle: 'VF 7', service: 'Có lắp đặt',
      stock: 'in-stock', maxPrice: '1000000', sort: 'price-desc',
    })
    expect(filterAccessoryProducts([other, product()], filters).map((item) => item.id))
      .toEqual(['product-1'])
  })

  it('derives real facets and distinguishes unknown fitment', () => {
    const base = product()
    expect(buildAccessoryFacets([base]).vehicles).toEqual([{ value: 'VF 7', count: 1 }])
    expect(accessoryFitmentStatus(base, 'VF 7')).toBe('compatible')
    expect(accessoryFitmentStatus(base, 'VF 8')).toBe('incompatible')
    expect(accessoryFitmentStatus(product({
      content: { ...base.content, compatibleModels: [] },
    }), 'VF 8')).toBe('unknown')
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
