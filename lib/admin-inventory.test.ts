import { describe, expect, it } from 'vitest'

import { isAdminSellableVehicleVariant } from './admin-inventory'

describe('isAdminSellableVehicleVariant', () => {
  it('accepts linked car and motorbike configurations', () => {
    expect(isAdminSellableVehicleVariant({
      product_id: 'car-product',
      product_variant_id: 'car-variant',
      product_type: 'CAR',
      sku: 'CAR-01-C01',
      version: 'Eco',
      color: 'Trắng',
    })).toBe(true)

    expect(isAdminSellableVehicleVariant({
      product_id: 'bike-product',
      product_variant_id: 'bike-variant',
      product_type: 'BIKE',
      sku: 'BIKE-01-C01',
      version: 'Tiêu chuẩn',
      color: 'Đỏ',
    })).toBe(true)
  })

  it('rejects model-level and incomplete vehicle rows', () => {
    expect(isAdminSellableVehicleVariant({
      product_id: 'car-product',
      product_variant_id: 'placeholder',
      product_type: 'CAR',
      sku: 'CAR-MODEL',
      version: 'Eco',
    })).toBe(false)

    expect(isAdminSellableVehicleVariant({
      product_id: 'accessory-product',
      product_variant_id: 'accessory-variant',
      product_type: 'ACCESSORY',
      sku: 'ACC-01',
      color: 'Đen',
    })).toBe(false)
  })
})
