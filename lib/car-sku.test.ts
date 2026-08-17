import { describe, expect, it } from 'vitest'

import { normalizeCarSkuBase } from './car-sku'

describe('car SKU format', () => {
  it('normalizes legacy colour and interior suffixes', () => {
    expect(normalizeCarSkuBase('VINFAST-VF3-01-C01', 'Summer Yellow')).toBe('VINFAST-VF3-01')
    expect(normalizeCarSkuBase('VFMPV7-TIEUCHUAN-ZENITH-GREY', 'Zenith Grey')).toBe('VFMPV7-TIEUCHUAN')
    expect(normalizeCarSkuBase('VINFAST-VF6-01-C05-COTTON-BEIGE', 'Solar Ruby', 'Cotton Beige')).toBe('VINFAST-VF6-01')
  })
})
