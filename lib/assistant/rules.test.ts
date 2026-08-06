import { describe, expect, it } from 'vitest'
import { classifySearchQuery, extractCatalogSearchQuery } from './rules'

describe('assistant rule engine', () => {
  it('handles casual Vietnamese text', () => expect(classifySearchQuery('Xin chào').intent).toBe('casual'))
  it('extracts motorbike budget without diacritics', () => {
    const result = classifySearchQuery('xe may duoi 20 trieu')
    expect(result.intent).toBe('recommendation')
    expect(result.filters).toMatchObject({ productType: 'motorbike', maxPrice: 20_000_000 })
    expect(result.catalogQuery).toBe('')
  })
  it('recognizes specification questions', () => expect(classifySearchQuery('VF9 đi được bao xa').intent).toBe('product_faq'))
  it('keeps only the model name for a specification question', () => {
    expect(classifySearchQuery('VF 9 đi được bao xa').catalogQuery).toBe('vf 9')
  })
  it('keeps product search deterministic', () => expect(classifySearchQuery('VF 9').intent).toBe('product_search'))
  it('removes conversational filler from a VinFast model query', () => {
    const result = classifySearchQuery('tìm cho mình mẫu xe VinFast VF 9')
    expect(result.catalogQuery).toBe('vinfast vf 9')
    expect(result.intent).toBe('product_search')
    expect(result.filters.productType).toBe('car')
  })
  it('preserves accessory terms and normalized model codes', () => {
    expect(extractCatalogSearchQuery('Tìm tấm che nắng cho VF9')).toBe('tam che nang vf 9')
    expect(classifySearchQuery('Tìm tấm che nắng cho VF9').filters.productType).toBe('accessory')
  })
  it('reduces a broad car request to the brand catalog term', () => {
    const result = classifySearchQuery('tìm cho mình tất cả các dòng xe ô tô VinFast')
    expect(result.filters.productType).toBe('car')
    expect(result.catalogQuery).toBe('vinfast')
  })
  it('removes generic category words from broad catalog requests', () => {
    expect(classifySearchQuery('tất cả phụ kiện')).toMatchObject({
      catalogQuery: '',
      filters: { productType: 'accessory' },
    })
    expect(classifySearchQuery('tất cả xe máy điện')).toMatchObject({
      catalogQuery: '',
      filters: { productType: 'motorbike' },
    })
  })
  it('keeps a minimum-price filter without treating electric as a model name', () => {
    expect(classifySearchQuery('xe máy điện giá từ 20 triệu')).toMatchObject({
      catalogQuery: '',
      filters: { productType: 'motorbike', minPrice: 20_000_000 },
    })
  })
  it.each([
    ['tìm xe máy điện giá hơn 15 triệu', { minPrice: 15_000_000 }],
    ['xe máy trên 15 triệu', { minPrice: 15_000_000 }],
    ['xe may it nhat 15 trieu', { minPrice: 15_000_000 }],
    ['xe máy dưới 15 triệu', { maxPrice: 15_000_000 }],
    ['xe máy không quá 15 triệu', { maxPrice: 15_000_000 }],
    ['xe máy rẻ hơn 15 triệu', { maxPrice: 15_000_000 }],
  ])('understands natural budget comparison: %s', (query, priceFilter) => {
    expect(classifySearchQuery(query)).toMatchObject({
      intent: 'recommendation',
      catalogQuery: '',
      filters: { productType: 'motorbike', ...priceFilter },
    })
  })
  it('understands ranges and minimum polarity', () => {
    expect(classifySearchQuery('xe máy điện không dưới 15 triệu')).toMatchObject({ filters: { minPrice: 15_000_000 } })
    expect(classifySearchQuery('xe máy điện không thấp hơn 15 triệu')).toMatchObject({ filters: { minPrice: 15_000_000 } })
    expect(classifySearchQuery('xe máy điện từ 15 đến 25 triệu')).toMatchObject({ filters: { minPrice: 15_000_000, maxPrice: 25_000_000 } })
  })
  it('supports cheapest and most expensive recommendations', () => {
    expect(classifySearchQuery('xe máy điện rẻ nhất').filters.sort).toBe('price_asc')
    expect(classifySearchQuery('xe máy điện đắt nhất').filters.sort).toBe('price_desc')
  })
  it('keeps only the model name in natural specification questions', () => {
    expect(classifySearchQuery('Amio công suất bao nhiêu').catalogQuery).toBe('amio')
    expect(classifySearchQuery('Evo tốc độ tối đa bao nhiêu')).toMatchObject({
      catalogQuery: 'evo',
      filters: {},
    })
    expect(classifySearchQuery('Amio dung lượng pin bao nhiêu').catalogQuery).toBe('amio')
  })
  it('does not turn punctuation into a catalog request', () => {
    expect(classifySearchQuery('!!!')).toMatchObject({ intent: 'unsupported', catalogQuery: '' })
  })
})
