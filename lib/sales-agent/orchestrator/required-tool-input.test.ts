import { describe, expect, it } from 'vitest'

import { canonicalizeRequiredToolInput } from './required-tool-input'

describe('required tool input canonicalization', () => {
  it('removes a model-invented district from a city-level workshop query', () => {
    const input = canonicalizeRequiredToolInput(
      'find_service_locations',
      { province: 'Hồ Chí Minh', district: 'Tân Bình', limit: 2 },
      {
        userText: 'Các xưởng xe máy điện VinFast tại Hồ Chí Minh mở cửa lúc mấy giờ?',
        afterSalesLookup: { toolName: 'find_service_locations' },
        officialManualLookup: false,
        warrantyKnowledgeLookup: false,
      },
    )

    expect(input).toMatchObject({
      vehicleType: 'motorbike',
      category: 'electric_motorbike_workshop',
      province: 'Hồ Chí Minh',
      limit: 8,
    })
    expect(input.district).toBeUndefined()
  })

  it('keeps the exact query for a verified link-only motorbike manual', () => {
    const input = canonicalizeRequiredToolInput(
      'search_user_manuals',
      { query: 'hướng dẫn chung' },
      {
        userText: 'Hướng dẫn sử dụng xe Klara S',
        afterSalesLookup: null,
        officialManualLookup: true,
        warrantyKnowledgeLookup: false,
      },
    )

    expect(input).toMatchObject({ query: 'Hướng dẫn sử dụng xe Klara S' })
  })

  it('pins service type and explicit vehicle context for after-sales', () => {
    const input = canonicalizeRequiredToolInput(
      'search_after_sales',
      { serviceType: 'warranty', vehicleType: 'motorbike', query: 'khác' },
      {
        userText: 'VF 8 2024 cần bảo dưỡng định kỳ sau bao lâu?',
        afterSalesLookup: { toolName: 'search_after_sales', serviceType: 'maintenance' },
        officialManualLookup: false,
        warrantyKnowledgeLookup: false,
      },
    )

    expect(input).toMatchObject({
      serviceType: 'maintenance',
      vehicleType: 'car',
      model: 'VF 8',
      query: 'VF 8 2024 cần bảo dưỡng định kỳ sau bao lâu?',
    })
  })
})
