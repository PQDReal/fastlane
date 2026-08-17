import { describe, expect, it } from 'vitest'

import {
  filterAdminInventoryItems,
  inventoryStatus,
  type AdminInventoryFilterItem,
  type AdminInventoryFilters,
} from './admin-inventory-filter'

const items: AdminInventoryFilterItem[] = [
  { sku: 'VF8-ECO-C01', productName: 'VF 8', variantName: 'VF 8 Eco - Đen', productType: 'CAR', categoryName: 'Ô tô điện', version: 'Eco', color: 'Đen', interiorColor: 'Granite Black', onHandQuantity: 8, isActive: true },
  { sku: 'AMIO-C01', productName: 'Amio', variantName: 'Tiêu chuẩn - Đỏ', productType: 'BIKE', categoryName: 'Xe máy điện', version: 'Tiêu chuẩn', color: 'Đỏ', interiorColor: null, onHandQuantity: 3, isActive: true },
  { sku: 'HELMET-BLACK', productName: 'Mũ bảo hiểm', variantName: 'Đen / M', productType: 'ACCESSORY', categoryName: 'Phụ kiện an toàn', version: null, color: null, interiorColor: null, onHandQuantity: 0, isActive: false },
]

const defaults: AdminInventoryFilters = {
  search: '', status: 'ALL', productType: 'ALL', product: 'ALL', variant: 'ALL',
  color: 'ALL', interiorColor: 'ALL', category: 'ALL', activity: 'ALL',
}

describe('admin inventory filters', () => {
  it('keeps stock statuses mutually exclusive', () => {
    expect(inventoryStatus(8)).toBe('IN_STOCK')
    expect(inventoryStatus(3)).toBe('LOW_STOCK')
    expect(inventoryStatus(0)).toBe('OUT_OF_STOCK')
    expect(filterAdminInventoryItems(items, { ...defaults, status: 'IN_STOCK' })).toHaveLength(1)
  })

  it('combines product type, product and vehicle-specific filters', () => {
    expect(filterAdminInventoryItems(items, {
      ...defaults,
      productType: 'CAR',
      product: 'VF 8',
      variant: 'Eco',
      color: 'Đen',
      interiorColor: 'Granite Black',
    }).map((item) => item.sku)).toEqual(['VF8-ECO-C01'])
  })

  it('uses accessory variant and category without requiring vehicle metadata', () => {
    expect(filterAdminInventoryItems(items, {
      ...defaults,
      productType: 'ACCESSORY',
      variant: 'Đen / M',
      category: 'Phụ kiện an toàn',
      activity: 'INACTIVE',
    }).map((item) => item.sku)).toEqual(['HELMET-BLACK'])
  })

  it('searches Vietnamese text without requiring accents', () => {
    expect(filterAdminInventoryItems(items, { ...defaults, search: 'xe may do' }).map((item) => item.sku)).toEqual(['AMIO-C01'])
    expect(filterAdminInventoryItems(items, { ...defaults, search: 'granite black' }).map((item) => item.sku)).toEqual(['VF8-ECO-C01'])
  })
})
