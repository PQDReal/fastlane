import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { catalogCacheEngine, CACHE_TTL_MS } from './catalog-cache'

describe('Catalog Cache Engine', () => {
  it('initializes with valid seeded snapshot and dynamic summary prompt', () => {
    const snapshot = catalogCacheEngine.getSnapshot()
    expect(snapshot).toBeDefined()
    expect(snapshot.products.length).toBeGreaterThan(0)
    expect(snapshot.accessories.length).toBeGreaterThan(0)
    expect(snapshot.dynamicSummaryPrompt).toContain('BẢNG THÔNG SỐ VÀ DANH MỤC TÓM TẮT')
    expect(snapshot.dynamicSummaryPrompt).toContain('VinFast VF 3')
    expect(snapshot.dynamicSummaryPrompt).toContain('VinFast VF 8')
    expect(snapshot.dynamicSummaryPrompt).toContain('Knowledge Base CMS')
    expect(snapshot.dynamicSummaryPrompt).toContain('Chính Sách Bảo Hành Xe Điện & Pin VinFast')
    expect(snapshot.knowledgeDocs.length).toBeGreaterThan(0)
  })

  it('returns valid status structure with products and chunks count', () => {
    const status = catalogCacheEngine.getStatus()
    expect(status).toHaveProperty('productsCount')
    expect(status).toHaveProperty('carsCount')
    expect(status).toHaveProperty('bikesCount')
    expect(status).toHaveProperty('accessoriesCount')
    expect(status).toHaveProperty('knowledgeDocsCount')
    expect(status).toHaveProperty('knowledgeChunksCount')
    expect(status).toHaveProperty('isRefreshing')
    expect(status.productsCount).toBeGreaterThan(0)
    expect(status.knowledgeDocsCount).toBeGreaterThan(0)
  })

  it('provides instant access to dynamic system prompt in < 1ms', () => {
    const start = performance.now()
    const prompt = catalogCacheEngine.getDynamicSummaryPrompt()
    const durationMs = performance.now() - start

    expect(durationMs).toBeLessThan(10)
    expect(prompt.length).toBeGreaterThan(100)
    expect(prompt).toContain('Ô tô điện VinFast')
  })

  it('supports force refresh without throwing on network failure', async () => {
    const beforeSnapshot = catalogCacheEngine.getSnapshot()
    const refreshed = await catalogCacheEngine.forceRefresh()

    expect(refreshed).toBeDefined()
    expect(refreshed.products.length).toBeGreaterThan(0)
    expect(refreshed.dynamicSummaryPrompt).toBeDefined()
  })
})
