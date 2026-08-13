import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: vi.fn() }))
vi.mock('@/lib/motorbike-catalog', () => ({ listMotorbikeCatalog: vi.fn() }))

import { searchSalesAgentCatalog, serializeCatalogContext } from './context'

describe('sales agent catalog context', () => {
  it('marks missing catalog evidence instead of inventing facts', () => {
    expect(serializeCatalogContext([])).toContain('không tìm thấy')
    expect(serializeCatalogContext([])).toContain('không suy đoán')
  })

  it('includes dataAsOf and typed product identity', () => {
    const result = serializeCatalogContext([{ id: 'p1', name: 'VF 8', slug: 'vf-8', productType: 'CAR', price: 900000000, availableQuantity: 2, availability: 'IN_STOCK', facts: { 'powertrain.range': '471 km' }, dataAsOf: '2026-08-12T00:00:00.000Z', sourceUpdatedAt: null }])
    expect(result).toContain('dataAsOf=2026-08-12T00:00:00.000Z')
    expect(result).toContain('VF 8')
    expect(result).toContain('471 km')
  })

  it('does not turn generic Vietnamese question words into a product filter', async () => {
    const { getSupabaseAdmin } = await import('@/lib/supabase-admin')
    const { listMotorbikeCatalog } = await import('@/lib/motorbike-catalog')
    const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), gte: vi.fn(), lte: vi.fn(), textSearch: vi.fn(), ilike: vi.fn(), order: vi.fn(), limit: vi.fn() }
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.in.mockReturnValue(query); query.gte.mockReturnValue(query); query.lte.mockReturnValue(query); query.textSearch.mockReturnValue(query); query.ilike.mockReturnValue(query); query.order.mockReturnValue(query); query.limit.mockResolvedValue({ data: [{ id: 'p1', name: 'VF 8', slug: 'vf-8', product_type: 'CAR', displayed_price: 1, specifications: { powertrain: { range: '471 km' } }, product_variants: [] }], error: null })
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: vi.fn().mockReturnValue(query) } as any)
    vi.mocked(listMotorbikeCatalog).mockResolvedValue([])
    const result = await searchSalesAgentCatalog('VF 8 đi được bao xa')
    expect(result[0]?.name).toBe('VF 8')
  })
})
