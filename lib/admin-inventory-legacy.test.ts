import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  legacyAdminInventoryFilterOptions,
  queryLegacyAdminInventory,
  type LegacyAdminInventoryItem,
} from './admin-inventory-legacy'
import type { AdminInventoryQueryParams } from './admin-inventory-query'

const items: LegacyAdminInventoryItem[] = [
  {
    variantId: 'variant-1', productId: '11111111-1111-4111-8111-111111111111', sku: 'CAR-VF8-ECO-WHITE',
    productName: 'VinFast VF 8', variantName: 'Eco - Trắng', productType: 'CAR', categoryName: 'Ô tô điện',
    version: 'Eco', color: 'Trắng Ngọc Trai', interiorColor: 'Granite Black', inventoryKey: null,
    onHandQuantity: 4, updatedAt: null, variantIsActive: true, productIsActive: true, isActive: true,
    inventoryStatus: 'LOW_STOCK', isSellable: true, hasInventoryRow: true,
  },
  {
    variantId: 'variant-2', productId: '22222222-2222-4222-8222-222222222222', sku: 'BIKE-KLARA-BLACK',
    productName: 'Klara Neo', variantName: 'Tiêu chuẩn - Đen', productType: 'BIKE', categoryName: 'Xe máy điện',
    version: 'Tiêu chuẩn', color: 'Đen Bóng', interiorColor: null, inventoryKey: null,
    onHandQuantity: 10, updatedAt: null, variantIsActive: true, productIsActive: true, isActive: true,
    inventoryStatus: 'IN_STOCK', isSellable: true, hasInventoryRow: true,
  },
]

function params(overrides: Partial<AdminInventoryQueryParams> = {}): AdminInventoryQueryParams {
  return {
    search: null,
    productType: 'ALL',
    productId: null,
    variant: null,
    color: null,
    interiorColor: null,
    status: 'ALL',
    activity: 'ALL',
    limit: 1,
    cursor: null,
    includeFilterOptions: false,
    ...overrides,
  }
}

describe('legacy inventory compatibility path', () => {
  it('keeps accent-insensitive filters, summary and opaque pagination', () => {
    const first = queryLegacyAdminInventory(items, params({ search: 'trang ngoc trai' }))
    expect(first.items.map((item) => item.variantId)).toEqual(['variant-1'])
    expect(first.summary.totalRows).toBe(1)
    expect(first.summary.statusCounts.LOW_STOCK).toBe(1)

    const pageOne = queryLegacyAdminInventory(items, params())
    const pageTwo = queryLegacyAdminInventory(items, params({ cursor: pageOne.nextCursor }))
    expect(pageOne.hasMore).toBe(true)
    expect(pageTwo.items.map((item) => item.variantId)).toEqual(['variant-2'])
  })

  it('derives product-specific variant and color metadata', () => {
    const options = legacyAdminInventoryFilterOptions(
      items,
      'CAR',
      '11111111-1111-4111-8111-111111111111',
    )
    expect(options.products.map((product) => product.name)).toEqual(['VinFast VF 8'])
    expect(options.variants).toEqual([{ value: 'Eco', label: 'Eco' }])
    expect(options.colors).toEqual([{ value: 'Trắng Ngọc Trai', label: 'Trắng Ngọc Trai' }])
    expect(options.interiorColors).toEqual([{ value: 'Granite Black', label: 'Granite Black' }])
  })
})
