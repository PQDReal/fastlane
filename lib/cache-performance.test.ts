import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  completeCacheSourceLoad,
  getCachePerformanceSnapshot,
  recordCacheRead,
  resetCachePerformanceForTests,
} from '@/lib/cache-performance'

describe('cache performance metrics', () => {
  beforeEach(() => {
    resetCachePerformanceForTests()
    vi.restoreAllMocks()
  })

  it('compares cache hits with source loads', () => {
    let now = 100
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    recordCacheRead('fastlane:car-catalog:1', 'MISS', 4)
    now = 200
    completeCacheSourceLoad('fastlane:car-catalog:1')
    recordCacheRead('fastlane:car-catalog:1', 'HIT', 10)

    const snapshot = getCachePerformanceSnapshot()
    expect(snapshot.total.hitRate).toBe(0.5)
    expect(snapshot.total.avgCacheReadMs).toBe(10)
    expect(snapshot.total.avgSourceLoadMs).toBe(100)
    expect(snapshot.total.improvementPercent).toBe(90)
  })

  it('reports bypasses separately from cache misses', () => {
    recordCacheRead('fastlane:customer-cart:user', 'BYPASS', 1)
    const snapshot = getCachePerformanceSnapshot()
    expect(snapshot.total.bypasses).toBe(1)
    expect(snapshot.total.misses).toBe(0)
    expect(snapshot.total.hitRate).toBeNull()
  })
})
