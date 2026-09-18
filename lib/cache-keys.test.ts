import { describe, expect, it } from 'vitest'

import {
  customerCartCacheKey,
  depositDraftCacheKey,
  normalizeSearchQuery,
  productSearchCacheKey,
} from '@/lib/cache-keys'

describe('Redis cache keys', () => {
  it('normalizes equivalent product searches to the same key', () => {
    expect(normalizeSearchQuery('  VinFast   AMIO ')).toBe('vinfast amio')
    expect(productSearchCacheKey('VinFast AMIO')).toBe(
      productSearchCacheKey('  vinfast   amio '),
    )
    expect(productSearchCacheKey('VinFast VF9')).toBe(
      productSearchCacheKey(' vinfast...vf 9 '),
    )
  })

  it('isolates carts by customer id', () => {
    expect(customerCartCacheKey('customer-a')).not.toBe(
      customerCartCacheKey('customer-b'),
    )
  })

  it('isolates deposit drafts without exposing the Auth0 subject in Redis', () => {
    const key = depositDraftCacheKey('auth0|sensitive-subject')
    expect(key).toMatch(/^fastlane:deposit-draft:v1:[a-f0-9]{64}$/)
    expect(key).not.toContain('sensitive-subject')
    expect(key).not.toBe(depositDraftCacheKey('auth0|another-subject'))
  })
})
