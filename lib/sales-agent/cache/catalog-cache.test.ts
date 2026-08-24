import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { catalogCacheEngine, CACHE_TTL_MS } from './catalog-cache'

describe('Catalog Cache Engine', () => {
  it('initializes with a vehicle-only catalog snapshot', () => {
    const snapshot = catalogCacheEngine.getSnapshot()
    expect(snapshot).toBeDefined()
    expect(snapshot.products.length).toBeGreaterThan(0)
    expect(snapshot.accessories.length).toBeGreaterThan(0)
    expect(snapshot).not.toHaveProperty('knowledgeDocs')
    expect(snapshot).not.toHaveProperty('knowledgeChunks')
    expect(snapshot).not.toHaveProperty('dynamicSummaryPrompt')
  })

  it('returns catalog status without knowledge storage counters', () => {
    const status = catalogCacheEngine.getStatus()
    expect(status).toHaveProperty('productsCount')
    expect(status).toHaveProperty('carsCount')
    expect(status).toHaveProperty('bikesCount')
    expect(status).toHaveProperty('accessoriesCount')
    expect(status).toHaveProperty('isRefreshing')
    expect(status.productsCount).toBeGreaterThan(0)
    expect(status).not.toHaveProperty('knowledgeDocsCount')
    expect(status).not.toHaveProperty('knowledgeChunksCount')
  })

  it('supports force refresh without throwing on network failure', async () => {
    const beforeSnapshot = catalogCacheEngine.getSnapshot()
    const refreshed = await catalogCacheEngine.forceRefresh()

    expect(refreshed).toBeDefined()
    expect(refreshed.products.length).toBeGreaterThan(0)
    expect(refreshed).not.toHaveProperty('knowledgeChunks')
  })

  it('triggers background revalidation on getSnapshot when TTL expires', () => {
    ;(catalogCacheEngine as any).snapshot.lastRefreshedAt = Date.now()
    const revalidateSpy = vi.spyOn(catalogCacheEngine, 'revalidateAsync')

    catalogCacheEngine.getSnapshot()
    expect(revalidateSpy).not.toHaveBeenCalled()

    ;(catalogCacheEngine as any).snapshot.lastRefreshedAt = Date.now() - (CACHE_TTL_MS + 1000)
    catalogCacheEngine.getSnapshot()
    expect(revalidateSpy).toHaveBeenCalledWith(false)
  })
})
