import { describe, expect, it } from 'vitest'

import { formatAfterSalesMeasurement } from './after-sales-display-value'

describe('formatAfterSalesMeasurement', () => {
  it.each([
    [{ valueText: '2 năm', valueNumeric: 2, unit: 'year' }, '2 năm'],
    [{ valueText: '60.000 km', valueNumeric: 60000, unit: 'km' }, '60.000 km'],
    [{ valueText: '6 tháng', valueNumeric: 6, unit: 'month' }, '6 tháng'],
    [{ valueText: '30 phút', valueNumeric: 30, unit: 'minute' }, '30 phút'],
    [{ valueText: '70%', valueNumeric: 70, unit: 'percent' }, '70%'],
  ])('không lặp đơn vị đã có trong value_text', (input, expected) => {
    expect(formatAfterSalesMeasurement(input)).toBe(expected)
  })

  it.each([
    [{ valueNumeric: 2, unit: 'year' }, '2 năm'],
    [{ valueNumeric: 60000, unit: 'km' }, '60.000 km'],
    [{ valueText: '2', valueNumeric: 2, unit: 'year' }, '2 năm'],
    [{ valueNumeric: 70, unit: 'percent' }, '70%'],
  ])('bổ sung đơn vị tiếng Việt khi giá trị chưa có đơn vị', (input, expected) => {
    expect(formatAfterSalesMeasurement(input)).toBe(expected)
  })
})
