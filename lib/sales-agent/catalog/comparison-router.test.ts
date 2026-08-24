import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type { CachedProduct } from '../cache/catalog-cache'
import { matchComparisonProducts } from './comparison-router'

function product(id: string, name: string, slug: string): CachedProduct {
  return {
    id,
    name,
    slug,
    description: null,
    productType: 'CAR',
    displayedPrice: null,
    thumbnailUrl: null,
    imageUrls: [],
    specifications: {},
    updatedAt: null,
    variants: [],
    vehicleVariants: [],
  }
}

const products = [
  product('vf8', 'VinFast VF 8', 'vf-8'),
  product('vf8-new', 'VinFast VF 8 The All-New 2026', 'vf-8-all-new'),
  product('vf9', 'VinFast VF 9', 'vf-9'),
]

describe('catalog product mention matching', () => {
  it('matches canonical products without confusing longer overlapping names', () => {
    expect(matchComparisonProducts('So sánh VF8 và VF9', products).map((item) => item.id))
      .toEqual(['vf8', 'vf9'])
    expect(matchComparisonProducts('/compare VF 8 All-New 2026 vs VF9', products).map((item) => item.id))
      .toEqual(['vf8-new', 'vf9'])
  })

  it('returns empty when no recognized products are mentioned', () => {
    expect(matchComparisonProducts('Cách kết nối wifi trên xe', products)).toEqual([])
  })
})

