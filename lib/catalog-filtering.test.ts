import { describe, expect, it } from 'vitest'

import type { CatalogProduct } from './catalog/types'
import {
  classifyAccessory,
  matchesBikePriceBand,
  matchesCatalogSearch,
  normalizeCatalogText,
} from './catalog-filtering'

function product(
  name: string,
  sourceCategory: string | null = null,
): CatalogProduct {
  return {
    id: name,
    categoryId: null,
    category: null,
    name,
    slug: normalizeCatalogText(name).replace(/ /g, '-'),
    description: '',
    productType: 'ACCESSORY',
    displayedPrice: 500_000,
    createdAt: null,
    content: {
      specificationText: null,
      specifications: {},
      category: sourceCategory,
      categories: sourceCategory ? [sourceCategory] : [],
    },
    collectionMemberships: [],
    legacyImageUrls: [],
    optionGroups: [],
    variants: [],
    media: { product: [], byVariant: {}, byOptionValue: {} },
    priceRange: { minimum: 500_000, maximum: 500_000 },
    availableQuantity: 0,
  }
}

describe('catalog filtering', () => {
  it('matches Vietnamese text without requiring accents', () => {
    expect(normalizeCatalogText('Xe máy điện Đỏ Tươi')).toBe(
      'xe may dien do tuoi',
    )
    expect(matchesCatalogSearch('do tuoi', 'Xe máy điện Đỏ Tươi')).toBe(
      true,
    )
  })

  it('uses non-overlapping bike price bands', () => {
    expect(matchesBikePriceBand(14_999_999, 'under-15')).toBe(true)
    expect(matchesBikePriceBand(15_000_000, '15-25')).toBe(true)
    expect(matchesBikePriceBand(25_000_000, '25-40')).toBe(true)
    expect(matchesBikePriceBand(40_000_000, 'over-40')).toBe(true)
  })

  it.each([
    ['Bộ Sạc Treo Tường AC 11 kW', 'Sạc ô tô điện'],
    ['Thảm Sàn 3D VF 9', 'Phụ kiện ô tô điện'],
    ['Áo Mưa Cánh Dơi Hai Mũ', 'Phụ kiện xe máy điện'],
    ['Áo Phông VF 7', 'Phong cách sống'],
  ])('uses source category %s for %s', (name, category) => {
    expect(classifyAccessory(product(name, category))).toBe(category)
  })

  it('falls back to the product name only when source data is absent', () => {
    expect(
      classifyAccessory(product('Bộ Sạc Treo Tường AC 11 kW')),
    ).toBe('Sạc ô tô điện')
    expect(classifyAccessory(product('Áo Mưa Cánh Dơi Hai Mũ'))).toBe(
      'Phụ kiện xe máy điện',
    )
  })
})
