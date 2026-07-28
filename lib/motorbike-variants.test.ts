import { describe, expect, it } from 'vitest'

import {
  buildMotorbikeVariantOptions,
  getMotorbikeVariantPrice,
} from './motorbike-variants'

describe('motorbike variant prices', () => {
  it('uses the price embedded in each variant name', () => {
    const options = buildMotorbikeVariantOptions(
      [
        'Kèm Pin: 49.900.000 VNĐ',
        'Không kèm Pin: 40.000.000 VNĐ',
      ],
      'Kèm Pin: 49.900.000 VNĐ / Không kèm Pin: 40.000.000 VNĐ',
    )

    expect(options).toEqual([
      { name: 'Kèm Pin: 49.900.000 VNĐ', price: 49_900_000 },
      { name: 'Không kèm Pin: 40.000.000 VNĐ', price: 40_000_000 },
    ])
  })

  it('falls back to product prices by variant order', () => {
    const options = buildMotorbikeVariantOptions(
      ['Kèm Pin', 'Không kèm Pin'],
      'Kèm Pin: 28.700.000 VNĐ / Không kèm Pin: 23.000.000 VNĐ',
    )

    expect(getMotorbikeVariantPrice(options, 'Không kèm Pin')).toBe(
      23_000_000,
    )
  })

  it('keeps Evo Neo battery choices at distinct prices', () => {
    const options = buildMotorbikeVariantOptions(
      [
        'Kèm Pin: 17.800.000 VNĐ',
        'Không kèm Pin: 12.200.000 VNĐ',
      ],
      'Kèm Pin: 17.800.000 VNĐ / Không kèm Pin: 12.200.000 VNĐ',
    )

    expect(options.map((option) => option.price)).toEqual([
      17_800_000,
      12_200_000,
    ])
  })
})
