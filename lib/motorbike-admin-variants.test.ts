import { describe, expect, it } from 'vitest'
import { reconstructMotorbikeAdminVersions } from './motorbike-admin-variants'

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
