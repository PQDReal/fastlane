import { describe, expect, it } from 'vitest'
import { normalizeDeclaredMotorbikeVersions, normalizeMotorbikeVersionName } from './motorbike-version'

describe('motorbike version normalization', () => {
  const colors = [
    { color_name: 'Đỏ Tươi' },
    { color_name: 'Trắng Ngọc Trai' },
    { color_name: 'Nâu Ánh Kim' },
    { color_name: 'Xanh Oliu' },
  ]

  it('removes the model prefix and colour suffix from legacy rows', () => {
    expect(normalizeMotorbikeVersionName(
      'Amio S Bản tiêu chuẩn (Đã bao gồm VAT) - Đỏ Tươi',
      ['Bản tiêu chuẩn (Đã bao gồm VAT)'],
      colors,
      'Amio S',
    )).toBe('Bản tiêu chuẩn (Đã bao gồm VAT)')
  })

  it('collapses repeated legacy colour suffixes', () => {
    expect(normalizeMotorbikeVersionName(
      'Kèm Pin - Nâu Ánh Kim - Trắng Ngọc Trai',
      ['Kèm Pin - Nâu Ánh Kim', 'Kèm Pin - Trắng Ngọc Trai'],
      colors,
      'Kyo',
    )).toBe('Kèm Pin')
  })

  it('removes price annotations from declared names only for matching', () => {
    expect(normalizeMotorbikeVersionName(
      'Kinet Kèm Pin - Xanh Oliu',
      ['Kèm Pin: 49.900.000 VNĐ', 'Không kèm Pin: 40.000.000 VNĐ'],
      colors,
      'Kinet',
    )).toBe('Kèm Pin')
  })

  it('deduplicates colour-specific declared versions', () => {
    expect(normalizeDeclaredMotorbikeVersions([
      'Kèm Pin - Nâu Ánh Kim',
      'Kèm Pin - Trắng Ngọc Trai',
      'Không kèm Pin - Nâu Ánh Kim',
    ], colors)).toEqual(['Kèm Pin', 'Không kèm Pin'])
  })
})
