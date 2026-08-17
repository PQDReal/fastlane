import { describe, expect, it } from 'vitest'

import {
  inventoryProductHighlightRanges,
  searchInventoryProducts,
} from './admin-inventory-product-search'

describe('inventory product combobox search', () => {
  it('matches normalized names without accents, spaces or punctuation', () => {
    expect(searchInventoryProducts(['VF 8', 'VF 3', 'Xe máy Feliz'], 'vf8').map((item) => item.label)).toEqual(['VF 8'])
    expect(searchInventoryProducts(['Amio', 'Feliz S'], 'feliz').map((item) => item.label)).toEqual(['Feliz S'])
    expect(searchInventoryProducts(['Xe máy Feliz'], 'xe may').map((item) => item.label)).toEqual(['Xe máy Feliz'])
  })

  it('orders exact and prefix matches ahead of substring matches', () => {
    expect(searchInventoryProducts(['VF 8 All New', 'All New VF 8', 'VF 8'], 'vf8').map((item) => item.label)).toEqual([
      'VF 8',
      'VF 8 All New',
      'All New VF 8',
    ])
  })

  it('maps normalized matches back to ranges in the displayed label', () => {
    const label = 'VinFast VF 8'
    const ranges = inventoryProductHighlightRanges(label, 'vf8')
    expect(ranges.map(([start, end]) => label.slice(start, end))).toEqual(['VF 8'])
  })
})
