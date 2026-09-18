import { describe, expect, it } from 'vitest'
import {
  buildMotorbikeDepositSpecs,
  depositVehicleKey,
  findDepositVehicle,
  parseVndAmount,
} from './deposit-vehicles'

describe('deposit vehicle helpers', () => {
  it('matches equivalent model names with different spacing', () => {
    expect(depositVehicleKey('Evo Grand')).toBe(depositVehicleKey('EvoGrand'))
    expect(findDepositVehicle([{ name: 'EvoGrand' }], 'Evo Grand')?.name).toBe(
      'EvoGrand',
    )
  })

  it('builds deposit specs from the normalized vehicle_variants view model', () => {
    const specs = buildMotorbikeDepositSpecs([{
      name: 'Evo Neo',
      displayed_price: 12_200_000,
      variants: [
        'Tùy chọn Kèm Pin (Mua đứt pin)',
        'Tùy chọn Không kèm Pin (Thuê pin)',
      ],
      variant_prices: {
        'Tùy chọn Kèm Pin (Mua đứt pin)': 17_800_000,
        'Tùy chọn Không kèm Pin (Thuê pin)': 12_200_000,
      },
      specs: {
        'Công suất tối đa': '1600 W',
        'Quãng đường đi được mỗi lần sạc': '78 km',
      },
    }])

    expect(parseVndAmount('12.200.000 VNĐ')).toBe(12_200_000)
    expect(
      specs['Evo Neo'].variants['Tùy chọn Không kèm Pin (Thuê pin)'],
    ).toMatchObject({
      price: 12_200_000,
      specs: {
        powertrain: { maxPower: '1600 W', distance: '78 km' },
      },
    })
  })
})
