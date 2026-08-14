import { describe, expect, it, vi } from 'vitest'

import {
  allocateVehicleVariantSkus,
  formatVehicleSku,
  isCanonicalVehicleSku,
  vehicleConfigurationKey,
} from './vehicle-sku'

describe('vehicle SKU contract', () => {
  it('uses the accessory-compatible prefix plus eight-digit shape and reserved ranges', () => {
    expect(formatVehicleSku('CAR', 10_000_001)).toBe('CAR10000001')
    expect(formatVehicleSku('BIKE', 20_000_001)).toBe('BIK20000001')
    expect(isCanonicalVehicleSku('CAR19999999', 'CAR')).toBe(true)
    expect(isCanonicalVehicleSku('BIK29999999', 'BIKE')).toBe(true)
    expect(isCanonicalVehicleSku('ACS30000001')).toBe(false)
    expect(isCanonicalVehicleSku('CAR20000001', 'CAR')).toBe(false)
  })

  it('normalizes configuration identities without depending on SKU wording', () => {
    expect(vehicleConfigurationKey({ version: 'Ti\u00eau chu\u1ea9n', color: '\u0110\u1ecf T\u01b0\u01a1i' })).toBe('tieu chuan\u001fdo tuoi\u001f')
    expect(vehicleConfigurationKey({ version: ' tieu  chuan ', color: 'do tuoi' })).toBe('tieu chuan\u001fdo tuoi\u001f')
  })

  it('accepts only a complete, unique allocation from the database', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: ['CAR10000001', 'CAR10000002'], error: null })
    await expect(allocateVehicleVariantSkus({ rpc }, 'CAR', 2)).resolves.toEqual(['CAR10000001', 'CAR10000002'])
    expect(rpc).toHaveBeenCalledWith('allocate_vehicle_variant_skus', {
      target_product_type: 'CAR',
      requested_count: 2,
    })

    await expect(allocateVehicleVariantSkus({
      rpc: vi.fn().mockResolvedValue({ data: ['BIK20000001', 'BIK20000001'], error: null }),
    }, 'BIKE', 2)).rejects.toThrow('duplicate or invalid')
  })
})
