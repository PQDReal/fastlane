import { describe, expect, it } from 'vitest'

import { requiredAfterSalesLookup } from './after-sales-intent'

describe('published after-sales intent', () => {
  it.each([
    ['VF 8 được bảo hành xe và pin bao lâu?', 'search_after_sales', 'warranty'],
    ['VF 8 cần bảo dưỡng định kỳ sau bao lâu?', 'search_after_sales', 'maintenance'],
    ['Xe máy điện cần bảo dưỡng phanh khi nào?', 'search_after_sales', 'maintenance'],
    ['Sau khi đặt lịch sửa chữa được đến muộn bao lâu?', 'search_after_sales', 'repair'],
    ['Cứu hộ VinFast phản hồi trong bao lâu?', 'search_after_sales', 'rescue'],
    ['Tìm xưởng dịch vụ xe máy tại TP.HCM', 'find_service_locations', undefined],
  ])('routes %s to %s', (query, toolName, serviceType) => {
    expect(requiredAfterSalesLookup(query)).toEqual(
      serviceType ? { toolName, serviceType } : { toolName },
    )
  })

  it.each([
    'Chính sách bảo hành pin của Evo?',
    'Pin thay thế xe máy điện được bảo hành bao lâu?',
    'Vị trí cổng sạc VF 8 ở đâu?',
    'Giá VF 8 hiện tại?',
  ])('does not steal the verified knowledge/manual/catalog flow for %s', (query) => {
    expect(requiredAfterSalesLookup(query)).toBeNull()
  })
})
