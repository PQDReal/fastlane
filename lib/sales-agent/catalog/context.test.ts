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

  it('returns BIKE rows for a category-only query before applying the result limit', async () => {
    const { getSupabaseAdmin } = await import('@/lib/supabase-admin')
    const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), gte: vi.fn(), lte: vi.fn(), textSearch: vi.fn(), ilike: vi.fn(), order: vi.fn(), limit: vi.fn() }
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.in.mockReturnValue(query); query.gte.mockReturnValue(query); query.lte.mockReturnValue(query); query.textSearch.mockReturnValue(query); query.ilike.mockReturnValue(query); query.order.mockReturnValue(query)
    query.limit.mockResolvedValue({ data: [
      { id: 'bike-1', name: 'VinFast Evo Grand', slug: 'vinfast-evo-grand', product_type: 'BIKE', displayed_price: 22000000, specifications: {}, product_variants: [] },
      { id: 'bike-2', name: 'VinFast Feliz S', slug: 'vinfast-feliz-s', product_type: 'MOTORBIKE', displayed_price: 30000000, specifications: {}, product_variants: [] },
    ], error: null })
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: vi.fn().mockReturnValue(query) } as any)

    const result = await searchSalesAgentCatalog('Có những mẫu xe máy điện nào?', 8)

    expect(result.map((item) => item.productType)).toEqual(['BIKE', 'BIKE'])
    expect(query.in).toHaveBeenCalledWith('product_type', ['BIKE', 'MOTORBIKE'])
  })

  it('keeps a bike category query with a budget as a BIKE browse', async () => {
    const { getSupabaseAdmin } = await import('@/lib/supabase-admin')
    const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), gte: vi.fn(), lte: vi.fn(), textSearch: vi.fn(), ilike: vi.fn(), order: vi.fn(), limit: vi.fn() }
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.in.mockReturnValue(query); query.gte.mockReturnValue(query); query.lte.mockReturnValue(query); query.textSearch.mockReturnValue(query); query.ilike.mockReturnValue(query); query.order.mockReturnValue(query)
    query.limit.mockResolvedValue({ data: [{ id: 'bike-1', name: 'VinFast Evo Grand', slug: 'vinfast-evo-grand', product_type: 'BIKE', displayed_price: 15000000, specifications: {}, product_variants: [{ id: 'v1', name: 'Standard', sku: 'EVO-1', original_price: 15000000, sale_price: null, is_active: true, inventory_items: null }] }], error: null })
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: vi.fn().mockReturnValue(query) } as any)

    const result = await searchSalesAgentCatalog({ query: 'Xe máy điện dưới 20 triệu', productTypes: ['BIKE'], maxPrice: 20000000 }, 8)

    expect(result[0]?.productType).toBe('BIKE')
    expect(query.textSearch).not.toHaveBeenCalled()
  })

  it('filters a CAR category browse before the bounded result limit', async () => {
    const { getSupabaseAdmin } = await import('@/lib/supabase-admin')
    const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), gte: vi.fn(), lte: vi.fn(), textSearch: vi.fn(), ilike: vi.fn(), order: vi.fn(), limit: vi.fn() }
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.in.mockReturnValue(query); query.gte.mockReturnValue(query); query.lte.mockReturnValue(query); query.textSearch.mockReturnValue(query); query.ilike.mockReturnValue(query); query.order.mockReturnValue(query)
    query.limit.mockResolvedValue({ data: [
      { id: 'car-1', name: 'VinFast VF 7', slug: 'vf-7', product_type: 'CAR', displayed_price: 799_000_000, specifications: {}, product_variants: [{ id: 'v1', name: 'Eco', sku: 'VF7-ECO', original_price: 799_000_000, sale_price: null, is_active: true, inventory_items: null }] },
      { id: 'bike-1', name: 'VinFast Evo', slug: 'evo', product_type: 'BIKE', displayed_price: 20_000_000, specifications: {}, product_variants: [] },
    ], error: null })
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: vi.fn().mockReturnValue(query) } as any)

    const result = await searchSalesAgentCatalog('Có những ô tô nào?', 8)

    expect(result.map((item) => item.productType)).toEqual(['CAR'])
    expect(query.in).toHaveBeenCalledWith('product_type', ['CAR', 'VEHICLE'])
  })

  it('keeps an ACCESSORY category browse separate from vehicle candidates', async () => {
    const { getSupabaseAdmin } = await import('@/lib/supabase-admin')
    const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), gte: vi.fn(), lte: vi.fn(), textSearch: vi.fn(), ilike: vi.fn(), order: vi.fn(), limit: vi.fn() }
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.in.mockReturnValue(query); query.gte.mockReturnValue(query); query.lte.mockReturnValue(query); query.textSearch.mockReturnValue(query); query.ilike.mockReturnValue(query); query.order.mockReturnValue(query)
    query.limit.mockResolvedValue({ data: [
      { id: 'accessory-1', name: 'Sạc treo tường', slug: 'sac-treo-tuong', product_type: 'ACCESSORY', displayed_price: 10_000_000, specifications: {}, product_variants: [{ id: 'v1', name: 'Chuẩn', sku: 'ACC-1', original_price: 10_000_000, sale_price: null, is_active: true, inventory_items: null }] },
      { id: 'car-1', name: 'VinFast VF 7', slug: 'vf-7', product_type: 'CAR', displayed_price: 799_000_000, specifications: {}, product_variants: [] },
    ], error: null })
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: vi.fn().mockReturnValue(query) } as any)

    const result = await searchSalesAgentCatalog('Có những phụ kiện nào?', 8)

    expect(result.map((item) => item.productType)).toEqual(['ACCESSORY'])
    expect(query.in).toHaveBeenCalledWith('product_type', ['ACCESSORY'])
  })

  it('uses the shared vehicle read contract and accepts legacy database types', async () => {
    const { getSupabaseAdmin } = await import('@/lib/supabase-admin')
    const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), gte: vi.fn(), lte: vi.fn(), textSearch: vi.fn(), ilike: vi.fn(), order: vi.fn(), limit: vi.fn() }
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.in.mockReturnValue(query); query.gte.mockReturnValue(query); query.lte.mockReturnValue(query); query.textSearch.mockReturnValue(query); query.ilike.mockReturnValue(query); query.order.mockReturnValue(query); query.limit.mockResolvedValue({ data: [], error: null })
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: vi.fn().mockReturnValue(query) } as any)

    await searchSalesAgentCatalog({ query: 'xe máy điện', productTypes: ['BIKE'] })

    expect(query.in).toHaveBeenCalledWith('product_type', ['BIKE', 'MOTORBIKE'])
    expect(query.select.mock.calls[0]?.[0]).toContain('product_variants')
    expect(query.select.mock.calls[0]?.[0]).toContain('vehicle_variants')
  })
})
