import { describe, expect, it } from 'vitest'

import { requiresManualLookup } from './manual-intent'

describe('user manual intent', () => {
  it.each([
    'Vị trí cổng sạc của VF 8 đời 2024 ở đâu?',
    'Cách khởi động VF 5 như thế nào?',
    'Đèn cảnh báo này có ý nghĩa gì?',
    'VF 8 có mấy túi khí?',
    'Cho tôi xem hướng dẫn sử dụng Klara S',
  ])('forces a manual lookup for %s', (query) => {
    expect(requiresManualLookup(query)).toBe(true)
  })

  it.each([
    'VF 8 cần bảo dưỡng sau bao nhiêu km?',
    'VF 8 được bảo hành bao lâu?',
    'Giá VF 8 hiện tại?',
    'Tìm xưởng dịch vụ tại Hồ Chí Minh',
  ])('does not steal another data flow for %s', (query) => {
    expect(requiresManualLookup(query)).toBe(false)
  })
})
