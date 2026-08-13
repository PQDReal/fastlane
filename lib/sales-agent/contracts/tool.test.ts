import { describe, expect, it } from 'vitest'

import { parseSalesAgentToolCall } from './tool'

const productId = '00000000-0000-4000-8000-000000000000'

describe('sales agent tool contracts', () => {
  it('resolves a bounded natural-language vehicle reference query', () => {
    expect(parseSalesAgentToolCall('resolve_vehicle_references', { query: 'VF7 và VF8', limit: 99 })).toEqual({
      name: 'resolve_vehicle_references',
      arguments: { query: 'VF7 và VF8', limit: 3 },
    })
  })

  it('bounds catalog inputs and supplies safe defaults', () => {
    expect(parseSalesAgentToolCall('search_catalog', { query: 'VF 8', limit: 99 })).toEqual({
      name: 'search_catalog',
      arguments: {
        query: 'VF 8',
        productTypes: undefined,
        minPrice: undefined,
        maxPrice: undefined,
        stockFilter: 'ALL',
        limit: 20,
      },
    })
  })

  it('accepts canonical UUID detail calls', () => {
    expect(parseSalesAgentToolCall('get_vehicle_details', { productId })).toEqual({
      name: 'get_vehicle_details',
      arguments: { productId },
    })
  })

  it('rejects unknown tools, fuzzy IDs and unexpected arguments', () => {
    expect(() => parseSalesAgentToolCall('delete_product', {})).toThrow('không được hỗ trợ')
    expect(() => parseSalesAgentToolCall('compare_vehicles', { productIds: [productId] })).toThrow('2 đến 3')
    expect(() => parseSalesAgentToolCall('get_vehicle_details', { productId: 'VF 8' })).toThrow('UUID')
    expect(() => parseSalesAgentToolCall('get_vehicle_details', { productId, rawSql: 'select *' })).toThrow('rawSql')
  })
})
