import { describe, expect, it } from 'vitest'

import { parseAdminInventoryQuery } from './admin-inventory-query'

describe('admin inventory query contract', () => {
  it('accepts normalized filters and an opaque cursor', () => {
    const result = parseAdminInventoryQuery(new URLSearchParams({
      search: 'VF8 không dấu',
      productType: 'bike',
      productId: '11111111-1111-4111-8111-111111111111',
      status: 'LOW_STOCK',
      activity: 'active',
      limit: '50',
      cursor: 'eyJza3UiOiJCSUsxIiwidmFyaWFudElkIjoiMTExMTExMTEtMTExMS00MTExLTgxMTEtMTExMTExMTExMTEifQ==',
    }))

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.productType).toBe('BIKE')
      expect(result.value.status).toBe('LOW_STOCK')
      expect(result.value.activity).toBe('ACTIVE')
      expect(result.value.limit).toBe(50)
      expect(result.value.includeFilterOptions).toBe(true)
    }
  })

  it('rejects invalid limit, UUID and status before calling the RPC', () => {
    expect(parseAdminInventoryQuery(new URLSearchParams({ limit: '0' })).ok).toBe(false)
    expect(parseAdminInventoryQuery(new URLSearchParams({ productId: 'not-a-uuid' })).ok).toBe(false)
    expect(parseAdminInventoryQuery(new URLSearchParams({ status: 'UNKNOWN' })).ok).toBe(false)
    expect(parseAdminInventoryQuery(new URLSearchParams({ includeFilterOptions: 'sometimes' })).ok).toBe(false)
  })

  it('allows the page to request inventory rows without repeating filter metadata', () => {
    const result = parseAdminInventoryQuery(new URLSearchParams({ includeFilterOptions: 'false' }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.includeFilterOptions).toBe(false)
  })
})
