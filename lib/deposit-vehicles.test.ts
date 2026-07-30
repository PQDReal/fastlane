import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  buildMotorbikeDepositSpecs,
  depositVehicleKey,
  findDepositVehicle,
  normalizeMotorbikesForDeposit,
  parseVndAmount,
} from './deposit-vehicles'

describe('deposit vehicle helpers', () => {
  it('matches equivalent model names with different spacing', () => {
    expect(depositVehicleKey('Evo Grand')).toBe(depositVehicleKey('EvoGrand'))
    expect(findDepositVehicle([{ name: 'EvoGrand' }], 'Evo Grand')?.name).toBe(
      'EvoGrand',
    )
  })

  it('normalizes motorbike colors, prices and deposit values', () => {
    const [bike] = normalizeMotorbikesForDeposit([
      {
        name: 'Test Bike',
        price: '11.600.000 VNĐ',
        deposit: '2.000.000 VNĐ',
        colors: ['Đỏ tươi'],
        variants: ['Bản tiêu chuẩn: 11.600.000 VNĐ'],
        representative_image: 'https://example.com/amio.webp',
        color_details: [],
      },
    ])

    expect(bike.name).toBe('Test Bike')
    expect(bike.displayed_price).toBe(11_600_000)
    expect(bike.deposit_value).toBe(2_000_000)
    expect(bike.colors[0]).toMatchObject({
      name: 'Đỏ tươi',
      image: 'https://example.com/amio.webp',
    })
  })

  it('builds variant pricing and specifications for the shared deposit UI', () => {
    const [bike] = normalizeMotorbikesForDeposit([
      {
        name: 'Evo Neo',
        price: 'Kèm Pin: 17.800.000 VNĐ',
        variants: ['Không kèm Pin: 12.200.000 VNĐ'],
        colors: [],
        specs: {
          'Công suất tối đa': '1600 W',
          'Quãng đường đi được mỗi lần sạc': '78 km',
        },
      },
    ])
    const specs = buildMotorbikeDepositSpecs([bike])

    expect(parseVndAmount('12.200.000 VNĐ')).toBe(12_200_000)
    expect(specs['Evo Neo'].variants['Không kèm Pin: 12.200.000 VNĐ']).toMatchObject(
      {
        price: 12_200_000,
        specs: { powertrain: { maxPower: '1600 W', distance: '78 km' } },
      },
    )
  })

  it('normalizes all 18 published motorbikes into selectable deposit vehicles', () => {
    const source = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), 'public', 'data', 'by_type', 'motorbikes.json'),
        'utf8',
      ),
    )
    const bikes = normalizeMotorbikesForDeposit(source)

    expect(bikes).toHaveLength(18)
    for (const bike of bikes) {
      expect(bike.name).not.toBe('')
      expect(bike.variants.length).toBeGreaterThan(0)
      expect(bike.colors.length).toBeGreaterThan(0)
      expect(bike.colors.every((color: { image: string }) => color.image !== '')).toBe(
        true,
      )
      expect(
        bike.colors.every(
          (color: { swatch?: string }) =>
            typeof color.swatch === 'string' && color.swatch !== '',
        ),
      ).toBe(true)
    }
  })
})
