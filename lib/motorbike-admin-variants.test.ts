import { describe, expect, it } from 'vitest'
import { reconstructMotorbikeAdminConfiguration, reconstructMotorbikeAdminVersions } from './motorbike-admin-variants'

describe('reconstructMotorbikeAdminVersions', () => {
  it('collapses version-colour inventory rows into one Admin version', () => {
    const versions = reconstructMotorbikeAdminVersions([
      {
        id: 'red',
        sku: 'VINFAST-NEW-1956-C01',
        name: 'Phiên bản Chính Thống - Đỏ Tươi',
        original_price: 10000,
        deposit_amount: 1000,
        metadata: { version: 'Phiên bản Chính Thống', color: 'Đỏ Tươi' },
      },
      {
        id: 'white',
        sku: 'VINFAST-NEW-1956-C02',
        name: 'Phiên bản Chính Thống - Trắng Ngọc Trai',
        original_price: 10000,
        deposit_amount: 1000,
        metadata: { version: 'Phiên bản Chính Thống', color: 'Trắng Ngọc Trai' },
      },
    ], ['Phiên bản Chính Thống'], [
      { color_name: 'Đỏ Tươi' },
      { color_name: 'Trắng Ngọc Trai' },
    ])

    expect(versions).toEqual([expect.objectContaining({
      name: 'Phiên bản Chính Thống',
      sku: 'VINFAST-NEW-1956',
      price: 10000,
      deposit_amount: 1000,
    })])
  })

  it('supports legacy rows without metadata', () => {
    const versions = reconstructMotorbikeAdminVersions([
      { sku: 'BIKE-01-C01', name: 'Bản tiêu chuẩn - Đỏ Tươi', original_price: '12000000' },
      { sku: 'BIKE-01-C02', name: 'Bản tiêu chuẩn - Trắng', original_price: '12000000' },
    ], ['Bản tiêu chuẩn'], [{ color_name: 'Đỏ Tươi' }, { color_name: 'Trắng' }])

    expect(versions).toHaveLength(1)
    expect(versions[0]).toMatchObject({ name: 'Bản tiêu chuẩn', sku: 'BIKE-01' })
  })
})

describe('reconstructMotorbikeAdminConfiguration', () => {
  it('does not duplicate Kyo base and colour-specific rows as separate versions', () => {
    const versions = reconstructMotorbikeAdminConfiguration({
      productVariants: [
        { id: 'base-buy', sku: 'VINFAST-KYO-01', name: 'Kèm Pin', original_price: 35300000 },
        { id: 'buy-brown', sku: 'VINFAST-KYO-01-C01', name: 'Kyo Kèm Pin - Nâu Ánh Kim', original_price: 35300000 },
        { id: 'base-rent', sku: 'VINFAST-KYO-02', name: 'Không kèm Pin', original_price: 30000000 },
        { id: 'rent-brown', sku: 'VINFAST-KYO-02-C01', name: 'Kyo Không kèm Pin - Nâu Ánh Kim', original_price: 30000000 },
      ],
      vehicleVariants: [
        { product_variant_id: 'buy-brown', version: 'Kèm Pin', color: 'Nâu Ánh Kim', sku: 'VINFAST-KYO-01-C01', price: 35300000 },
        { product_variant_id: 'rent-brown', version: 'Không kèm Pin', color: 'Nâu Ánh Kim', sku: 'VINFAST-KYO-02-C01', price: 30000000 },
      ],
      inventoryByVariantId: new Map([['buy-brown', 3], ['rent-brown', 2]]),
      declaredVersions: ['Kèm Pin: 35.300.000 VNĐ', 'Không kèm Pin: 30.000.000 VNĐ'],
      colors: [{ color_name: 'Nâu Ánh Kim' }],
    })

    expect(versions).toHaveLength(2)
    expect(versions.map((version) => version.name)).toEqual(['Kèm Pin', 'Không kèm Pin'])
    expect(versions[0]).toMatchObject({
      sku: 'VINFAST-KYO-01',
      compatible_colors: ['Nâu Ánh Kim'],
      stock_by_color: { 'Nâu Ánh Kim': 3 },
    })
    expect(new Set(versions.flatMap((version) => version.compatible_colors
      .map((color) => `${version.sku}-${color}`))).size).toBe(2)
  })
})
