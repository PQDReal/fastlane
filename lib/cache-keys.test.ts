import { describe, expect, it } from 'vitest'

import {
  customerCartCacheKey,
  normalizeSearchQuery,
  productSearchCacheKey,
} from '@/lib/cache-keys'

describe('Redis cache keys', () => {
  it('normalizes equivalent product searches to the same key', () => {
    expect(normalizeSearchQuery('  VinFast   AMIO ')).toBe('vinfast amio')
    expect(productSearchCacheKey('VinFast AMIO')).toBe(
      productSearchCacheKey('  vinfast   amio '),
    )
  })

  it('isolates carts by customer id', () => {
    expect(customerCartCacheKey('customer-a')).not.toBe(
      customerCartCacheKey('customer-b'),
    )
  })
})
