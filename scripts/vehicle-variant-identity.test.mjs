import { describe, expect, it } from 'vitest'

import {
  assertCanonicalVehicleSku,
  isCanonicalVehicleSku,
  vehicleConfigurationKey,
  vehicleInteriorColor,
  vehicleVersionSku,
} from './vehicle-variant-identity.mjs'

describe('vehicle script identity', () => {
  it('matches configurations without depending on accents, case, or SKU', () => {
    expect(vehicleConfigurationKey({
      productId: 'p1',
      version: 'Tiêu Chuẩn',
      color: 'Đỏ Đậm',
      interiorColor: 'Đen',
    })).toBe(vehicleConfigurationKey({
      productId: 'P1',
      version: 'tieu chuan',
      color: 'do dam',
      interiorColor: 'den',
    }))
  })

  it('accepts only canonical opaque vehicle SKUs', () => {
    expect(isCanonicalVehicleSku('CAR10000001', 'CAR')).toBe(true)
    expect(isCanonicalVehicleSku('BIK20000001', 'BIKE')).toBe(true)
    expect(isCanonicalVehicleSku('VF8-ALLNEW-C01', 'CAR')).toBe(false)
    expect(() => assertCanonicalVehicleSku('VINFAST-VIPER-01', 'BIKE')).toThrow('canonical BIKE SKU')
  })

  it('reads version and interior metadata independently from inventory SKU', () => {
    const row = {
      version: 'Eco',
      interior_color: '',
      specs: { catalog: { version_sku: 'VF8-ECO', interior_color: 'Granite Black' } },
    }
    expect(vehicleVersionSku(row)).toBe('VF8-ECO')
    expect(vehicleInteriorColor(row)).toBe('Granite Black')
  })
})
