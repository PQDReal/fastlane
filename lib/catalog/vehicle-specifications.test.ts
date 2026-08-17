import { describe, expect, it } from 'vitest'

import { normalizeVehicleSpecFacts, normalizeVehicleSpecFactsWithDiagnostics } from './vehicle-specifications'

const standardBikeShape = {
  'Tiền đặt cọc': '',
  'Màu sắc': '',
  'Dài x Rộng x Cao (mm)': '',
  'Khoảng cách trục bánh Trước-Sau': '',
  'Khoảng sáng gầm': '',
  'Chiều cao yên': '',
  'Trọng lượng xe': '',
  'Tải trọng': '',
  'Thể tích cốp': '',
  'Kích thước lốp Trước - Sau': '',
  'Giảm xóc trước và sau': '',
  'Phanh trước và sau': '',
  'Khóa xe': '',
  'Đèn pha trước': '',
  'Loại động cơ': '',
  'Công suất danh định': '',
  'Công suất tối đa': '800 W',
  'Tốc độ tối đa': '30 km/h',
  'Tốc độ tối đa - SPORT': '',
  'Tốc độ tối đa - ECO': '',
  'Gia tốc 0 - 50 km/h': '',
  'Gia tốc 0 - 40 km/h': '',
  'Khả năng leo dốc 20%': '',
  'Loại pin/ắc quy': '',
  'Dung lượng pin/ắc quy': '1,024 kWh',
  'Trọng lượng pin/ắc quy': '',
  'Loại sạc': '',
  'Thời gian sạc tiêu chuẩn': '',
  'Vị trí lắp pin': '',
  'Quãng đường đi được mỗi lần sạc': 'Khoảng 65 km',
  'Tiêu chuẩn chống nước động cơ': '',
}

describe('vehicle specification normalization', () => {
  it('normalizes canonical car facts without guessing unsupported fields', () => {
    const facts = normalizeVehicleSpecFacts('CAR', {
      specs: {
        Eco: {
          specs: {
            dimension: {},
            exterior: {},
            safety: {},
            powertrain: {
              distance: '471 km (WLTP)',
              maxPower: '150 kW',
              batteryCapacity: '87,7 kWh',
              topSpeed: '200 km/h',
            },
            interior: { numberOfSeats: 5 },
          },
        },
      },
    }, '2026-08-12T00:00:00.000Z')

    expect(facts.range_km?.displayValue).toBe('471 km (WLTP)')
    expect(facts.max_power_kw?.value).toBe(150)
    expect(facts.battery_capacity_kwh?.value).toBe(87.7)
    expect(facts.seats?.value).toBe(5)
    expect(facts.max_torque_nm).toBeUndefined()
  })

  it('normalizes Vietnamese motorbike labels and converts watts to kilowatts', () => {
    const facts = normalizeVehicleSpecFacts('BIKE', { specs: standardBikeShape }, '2026-08-12T00:00:00.000Z')

    expect(facts.range_km?.displayValue).toBe('Khoảng 65 km')
    expect(facts.range_km?.comparable).toBe(false)
    expect(facts.max_power_kw?.value).toBe(0.8)
    expect(facts.battery_capacity_kwh?.value).toBe(1.024)
    expect(facts.top_speed_kmh?.value).toBe(30)
  })

  it('fails closed for an unsupported car fingerprint', () => {
    const result = normalizeVehicleSpecFactsWithDiagnostics('CAR', {
      specs: { Eco: { specs: { dimension: {}, powertrain: {}, interior: {}, safety: {}, future: {} } } },
    }, '2026-08-12T00:00:00.000Z')

    expect(result.facts).toEqual({})
    expect(result.warnings[0]?.code).toBe('UNSUPPORTED_SPEC_SCHEMA')
  })

  it('accepts the alternate bike fingerprint without guessing missing labels', () => {
    const result = normalizeVehicleSpecFactsWithDiagnostics('BIKE', {
      specs: {
        'Màu sắc': 'Đen',
        'Thời gian sạc tiêu chuẩn': '4 giờ',
        'Loại động cơ': 'Inhub',
        'Công suất danh định': '1800 W',
        'Giảm xóc': 'Thủy lực',
        'Loại ắc quy': 'LFP',
        'Dung lượng ắc quy': '1,5 kWh',
        'Công suất lớn nhất': '3000 W',
        'Trọng lượng': '100 kg',
        'Dài x Rộng x Cao': '1999 x 694 x 1130 mm',
        'Phanh trước và sau': 'Đĩa',
        'Vận tốc': '70 km/h',
        'Quãng đường 1 lần sạc (2 pin)': '160 km',
        'Cốp xe': '21 L',
        'Công suất': '3000 W',
        'Quãng đường': '160 km',
      },
    }, '2026-08-12T00:00:00.000Z')

    expect(result.warnings).toEqual([])
    expect(result.facts.top_speed_kmh?.value).toBe(70)
    expect(result.facts.range_km?.value).toBe(160)
    expect(result.facts.max_power_kw?.value).toBe(3)
  })
})
