import { describe, expect, it } from 'vitest'
import {
  extractCanonicalVehicleSpecs,
  flattenRawSpecifications,
  getCanonicalSpecFact,
} from './spec-extractor'

describe('spec-extractor', () => {
  it('extracts motorbike specifications accurately from nested Vietnamese keys', () => {
    const evoGrand = {
      name: 'EvoGrand',
      productType: 'BIKE',
      specifications: {
        url: 'https://vinfastauto.com/vn_vi/xe-may-dien-evogrand',
        name: 'EvoGrand',
        specs: {
          'Loại pin/ắc quy': 'LFP',
          'Dung lượng pin/ắc quy': '1,5 kWh',
          'Tốc độ tối đa': '70 km/h',
          'Trọng lượng xe': '86 kg (bao gồm 01 pin)',
          'Quãng đường đi được mỗi lần sạc': '198 km (với 2 pin LFP)',
          'Công suất tối đa': '2250 W',
          'Thể tích cốp': '22L',
        },
      },
    }

    const canonical = extractCanonicalVehicleSpecs(evoGrand)
    expect(canonical.battery).toContain('1,5 kWh')
    expect(canonical.battery).toContain('LFP')
    expect(canonical.topSpeed).toBe('70 km/h')
    expect(canonical.weight).toBe('86 kg (bao gồm 01 pin)')
    expect(canonical.range).toBe('198 km (với 2 pin LFP)')
    expect(canonical.power).toBe('2250 W')
    expect(canonical.trunk).toBe('22L')
  })

  it('does NOT inject hardcoded 3.5 kWh fallback when battery is missing', () => {
    const incompleteBike = {
      name: 'CustomBike',
      productType: 'BIKE',
      specifications: {
        specs: {
          'Tốc độ tối đa': '50 km/h',
        },
      },
    }

    const canonical = extractCanonicalVehicleSpecs(incompleteBike)
    expect(canonical.battery).toBeUndefined()
    expect(canonical.topSpeed).toBe('50 km/h')
    expect(canonical.weight).toBeUndefined()
  })

  it('extracts car specifications from nested version objects', () => {
    const vf8 = {
      name: 'VinFast VF 8',
      productType: 'CAR',
      specifications: {
        specs: {
          Eco: {
            specs: {
              powertrain: {
                batteryCapacity: 87.7,
                distance: '562 (NEDC)',
                maxPower: '201',
                maxTorque: '310',
                fastChargingTime: '31 phút',
              },
              dimension: {
                length: '4.750 x 1.934 x 1.667',
                kurbWeightPayload: '2.328/ 450',
                numberOfSeats: 5,
              },
            },
          },
        },
      },
    }

    const canonical = extractCanonicalVehicleSpecs(vf8)
    expect(canonical.battery).toContain('87.7')
    expect(canonical.range).toBe('562 (NEDC)')
    expect(canonical.power).toBe('201')
    expect(canonical.weight).toBe('2.328/ 450')
    expect(canonical.chargingTime).toBe('31 phút')
    expect(canonical.seats).toBe('5')
  })

  it('resolves canonical spec facts by alias or English key', () => {
    const specs = extractCanonicalVehicleSpecs({
      name: 'Feliz II',
      productType: 'BIKE',
      specifications: {
        specs: {
          'Loại pin/ắc quy': 'LFP',
          'Dung lượng pin/ắc quy': '1,5 kWh, tùy chọn thêm 1 pin',
          'Tốc độ tối đa': '70 km/h',
        },
      },
    })

    const batteryFact = getCanonicalSpecFact(specs, 'battery_capacity_kwh')
    expect(batteryFact?.displayValue).toContain('1,5 kWh')

    const speedFact = getCanonicalSpecFact(specs, 'top_speed_kmh')
    expect(speedFact?.displayValue).toBe('70 km/h')

    const weightFact = getCanonicalSpecFact(specs, 'weight')
    expect(weightFact).toBeUndefined()
  })
})
