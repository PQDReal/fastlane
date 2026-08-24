import { describe, expect, it } from 'vitest'

import { requiresWarrantyKnowledgeLookup } from './warranty-intent'

describe('warranty knowledge intent', () => {
  it.each([
    'Chính sách bảo hành pin của Evo?',
    'Pin thay thế được mấy năm?',
    'Ắc quy 12V có được bảo hành không?',
    'Xe này dùng mô hình đổi pin',
    'battery warranty for Evo',
  ])('forces a knowledge lookup for %s', (query) => {
    expect(requiresWarrantyKnowledgeLookup(query)).toBe(true)
  })

  it.each([
    'Giá Evo hiện tại là bao nhiêu?',
    'Pin Evo có dung lượng bao nhiêu?',
    'So sánh tốc độ Feliz và Klara',
    'Màu nào đang có sẵn?',
  ])('does not force a lookup for %s', (query) => {
    expect(requiresWarrantyKnowledgeLookup(query)).toBe(false)
  })
})
