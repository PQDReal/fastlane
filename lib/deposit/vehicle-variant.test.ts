import { describe, expect, it } from 'vitest'

import { matchesDepositVehicleVariant } from './vehicle-variant'

describe('matchesDepositVehicleVariant', () => {
  it('matches VF 2 display version to the exact Sky Blue inventory row', () => {
    expect(matchesDepositVehicleVariant(
      {
        version: 'Tiêu chuẩn',
        variant_name: 'VinFast VF 2 Tiêu chuẩn Sky Blue',
        color: 'Sky Blue',
      },
      { vehicleVariant: 'VF 2 Tiêu chuẩn', exteriorColor: 'Sky Blue' },
    )).toBe(true)
  })

  it('rejects a different color even when the version is identical', () => {
    expect(matchesDepositVehicleVariant(
      {
        version: 'Tiêu chuẩn',
        variant_name: 'VinFast VF 2 Tiêu chuẩn Rose Pink',
        color: 'Rose Pink',
      },
      { vehicleVariant: 'VF 2 Tiêu chuẩn', exteriorColor: 'Sky Blue' },
    )).toBe(false)
  })

  it('normalizes accents and model prefixes in version names', () => {
    expect(matchesDepositVehicleVariant(
      { version: 'Nâng cao', color: 'Đỏ tươi' },
      { vehicleVariant: 'VinFast VF 7 Nâng cao', exteriorColor: 'Do tuoi' },
    )).toBe(true)
  })
})
