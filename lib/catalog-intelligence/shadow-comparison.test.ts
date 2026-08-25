import { describe, expect, it } from 'vitest'

import { compareLegacyAndCanonicalCatalog } from './shadow-comparison'
import type { CatalogProductInput } from './types'

const car: CatalogProductInput = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'VF Test',
  productType: 'CAR',
  updatedAt: '2026-08-24T00:00:00Z',
  specifications: {
    specs: {
      Eco: {
        specs: {
          dimension: {},
          exterior: {},
          interior: { numberOfSeats: 5 },
          powertrain: {
            distance: '471 km',
            maxPower: '150 kW',
            maxTorque: '620 Nm',
            topSpeed: '200 km/h',
            batteryCapacity: '87,7 kWh',
            fastChargingTime: '30 phút',
            drivetrain: 'RWD',
          },
          safety: {},
        },
      },
    },
  },
}

describe('legacy versus canonical catalog shadow comparison', () => {
  it('reports matching normalized facts without changing the read path', () => {
    const report = compareLegacyAndCanonicalCatalog([car])

    expect(report).toMatchObject({ mode: 'SHADOW_READ_ONLY', products: 1, writes: 0 })
    expect(report.productReports[0].factComparisons).toEqual(expect.arrayContaining([
      expect.objectContaining({ canonicalKey: 'range_km', status: 'MATCH' }),
      expect.objectContaining({ canonicalKey: 'max_power_kw', status: 'MATCH' }),
      expect.objectContaining({ canonicalKey: 'top_speed_kmh', status: 'MATCH' }),
    ]))
  })

  it('surfaces legacy unitless horsepower interpretation as a mismatch', () => {
    const report = compareLegacyAndCanonicalCatalog([{
      ...car,
      specifications: {
        specs: {
          Eco: {
            specs: {
              dimension: {}, exterior: {}, interior: {}, safety: {},
              powertrain: { maxPower: 134 },
            },
          },
        },
      },
    }])

    expect(report.productReports[0].factComparisons).toContainEqual(expect.objectContaining({
      canonicalKey: 'max_power_kw',
      status: 'VALUE_MISMATCH',
      legacy: expect.objectContaining({ value: 134 }),
      canonical: [expect.objectContaining({ value: expect.objectContaining({ numericValue: 99.923782848 }) })],
    }))
  })

  it('marks canonical multi-context values instead of flattening them', () => {
    const bikeSpecs = {
      'Tiền đặt cọc': '', 'Màu sắc': '', 'Dài x Rộng x Cao (mm)': '',
      'Khoảng cách trục bánh Trước-Sau': '', 'Khoảng sáng gầm': '', 'Chiều cao yên': '',
      'Trọng lượng xe': '', 'Tải trọng': '', 'Thể tích cốp': '', 'Kích thước lốp Trước - Sau': '',
      'Giảm xóc trước và sau': '', 'Phanh trước và sau': '', 'Khóa xe': '', 'Đèn pha trước': '',
      'Loại động cơ': '', 'Công suất danh định': '', 'Công suất tối đa': '', 'Tốc độ tối đa': '',
      'Tốc độ tối đa - SPORT': '', 'Tốc độ tối đa - ECO': '', 'Gia tốc 0 - 50 km/h': '',
      'Gia tốc 0 - 40 km/h': '', 'Khả năng leo dốc 20%': '', 'Loại pin/ắc quy': '',
      'Dung lượng pin/ắc quy': '', 'Trọng lượng pin/ắc quy': '', 'Loại sạc': '',
      'Thời gian sạc tiêu chuẩn': 'Khoảng 9 giờ; khoảng 3,5 giờ nếu dùng sạc 1000 W',
      'Vị trí lắp pin': '', 'Quãng đường đi được mỗi lần sạc': '', 'Tiêu chuẩn chống nước động cơ': '',
    }
    const report = compareLegacyAndCanonicalCatalog([{
      id: '00000000-0000-4000-8000-000000000003',
      name: 'Kinet',
      productType: 'MOTORBIKE',
      specifications: { specs: bikeSpecs },
    }])

    expect(report.productReports[0].factComparisons).toContainEqual(expect.objectContaining({
      canonicalKey: 'charging_time',
      status: 'CONTEXT_SPLIT',
      canonical: expect.arrayContaining([
        expect.objectContaining({ contextKey: '[{"key":"charging_mode","value":"STANDARD"}]' }),
        expect.objectContaining({ contextKey: '[{"key":"charger_power_w","value":1000,"unit":"W"}]' }),
      ]),
    }))
  })

  it('skips accessories and emits byte-stable output', () => {
    const accessory: CatalogProductInput = {
      id: '00000000-0000-4000-8000-000000000004',
      name: 'Accessory',
      productType: 'ACCESSORY',
      specifications: {},
    }
    const first = compareLegacyAndCanonicalCatalog([accessory, car])
    const second = compareLegacyAndCanonicalCatalog([car, accessory])

    expect(first.accessoryProductsSkipped).toBe(1)
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })
})
