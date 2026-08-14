import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ discoverAccessories: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: vi.fn() }))
vi.mock('@/lib/motorbike-catalog', () => ({ listMotorbikeCatalog: vi.fn() }))
vi.mock('./accessories', () => ({ discoverSalesAgentAccessories: mocks.discoverAccessories }))

import { searchSalesAgentCatalog, serializeCatalogContext } from './context'

describe('sales agent catalog context', () => {
  it('marks missing catalog evidence instead of inventing facts', () => {
    expect(serializeCatalogContext([])).toContain('không tìm thấy')
    expect(serializeCatalogContext([])).toContain('không suy đoán')
  })

  it('includes dataAsOf and typed product identity', () => {
    const result = serializeCatalogContext([{ id: 'p1', name: 'VF 8', slug: 'vf-8', url: '/cars/vf-8', productType: 'CAR', isActive: true, description: null, price: 900000000, facts: { range_km: '471 km' }, dataAsOf: '2026-08-12T00:00:00.000Z', sourceUpdatedAt: null }])
    expect(result).toContain('dataAsOf=2026-08-12T00:00:00.000Z')
    expect(result).toContain('VF 8')
    expect(result).toContain('471 km')
    expect(result).toContain('/cars/vf-8')
  })

  it('does not turn generic Vietnamese question words into a product filter', async () => {
    const { getSupabaseAdmin } = await import('@/lib/supabase-admin')
    const { listMotorbikeCatalog } = await import('@/lib/motorbike-catalog')
    const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), gte: vi.fn(), lte: vi.fn(), textSearch: vi.fn(), ilike: vi.fn(), order: vi.fn(), limit: vi.fn() }
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.in.mockReturnValue(query); query.gte.mockReturnValue(query); query.lte.mockReturnValue(query); query.textSearch.mockReturnValue(query); query.ilike.mockReturnValue(query); query.order.mockReturnValue(query); query.limit.mockResolvedValue({ data: [{ id: 'p1', name: 'VF 8', slug: 'vf-8', product_type: 'CAR', displayed_price: 1, specifications: { powertrain: { range: '471 km' } }, product_variants: [] }], error: null })
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: vi.fn().mockReturnValue(query) } as any)
    vi.mocked(listMotorbikeCatalog).mockResolvedValue([])
    const result = await searchSalesAgentCatalog({ query: 'VF 8' })
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

    const result = await searchSalesAgentCatalog({ productTypes: ['BIKE'], limit: 8 })

    expect(result.map((item) => item.productType)).toEqual(['BIKE', 'BIKE'])
    expect(query.in).toHaveBeenCalledWith('product_type', ['BIKE', 'MOTORBIKE'])
  })

  it('keeps a bike category query with a budget as a BIKE browse', async () => {
    const { getSupabaseAdmin } = await import('@/lib/supabase-admin')
    const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), gte: vi.fn(), lte: vi.fn(), textSearch: vi.fn(), ilike: vi.fn(), order: vi.fn(), limit: vi.fn() }
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.in.mockReturnValue(query); query.gte.mockReturnValue(query); query.lte.mockReturnValue(query); query.textSearch.mockReturnValue(query); query.ilike.mockReturnValue(query); query.order.mockReturnValue(query)
    query.limit.mockResolvedValue({ data: [{ id: 'bike-1', name: 'VinFast Evo Grand', slug: 'vinfast-evo-grand', product_type: 'BIKE', displayed_price: 15000000, specifications: {}, product_variants: [{ id: 'v1', name: 'Standard', sku: 'EVO-1', original_price: 15000000, sale_price: null, is_active: true }] }], error: null })
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: vi.fn().mockReturnValue(query) } as any)

    const result = await searchSalesAgentCatalog({ productTypes: ['BIKE'], maxPrice: 20000000 }, 8)

    expect(result[0]?.productType).toBe('BIKE')
    expect(query.textSearch).not.toHaveBeenCalled()
  })

  it('filters a CAR category browse before the bounded result limit', async () => {
    const { getSupabaseAdmin } = await import('@/lib/supabase-admin')
    const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), gte: vi.fn(), lte: vi.fn(), textSearch: vi.fn(), ilike: vi.fn(), order: vi.fn(), limit: vi.fn() }
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.in.mockReturnValue(query); query.gte.mockReturnValue(query); query.lte.mockReturnValue(query); query.textSearch.mockReturnValue(query); query.ilike.mockReturnValue(query); query.order.mockReturnValue(query)
    query.limit.mockResolvedValue({ data: [
      { id: 'car-1', name: 'VinFast VF 7', slug: 'vf-7', product_type: 'CAR', displayed_price: 799_000_000, specifications: {}, product_variants: [{ id: 'v1', name: 'Eco', sku: 'VF7-ECO', original_price: 799_000_000, sale_price: null, is_active: true }] },
      { id: 'bike-1', name: 'VinFast Evo', slug: 'evo', product_type: 'BIKE', displayed_price: 20_000_000, specifications: {}, product_variants: [] },
    ], error: null })
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: vi.fn().mockReturnValue(query) } as any)

    const result = await searchSalesAgentCatalog({ productTypes: ['CAR'], limit: 8 })

    expect(result.map((item) => item.productType)).toEqual(['CAR'])
    expect(query.in).toHaveBeenCalledWith('product_type', ['CAR', 'VEHICLE'])
  })

  it('keeps an ACCESSORY category browse separate from vehicle candidates', async () => {
    mocks.discoverAccessories.mockResolvedValue({ items: [{
      productId: 'accessory-1', name: 'Sạc treo tường', slug: 'sac-treo-tuong', url: '/accessories/sac-treo-tuong', isActive: true,
      description: null, price: 10_000_000, facts: {}, associationStatus: 'UNKNOWN', associationSource: null,
      dataAsOf: '2026-08-14T00:00:00.000Z', sourceUpdatedAt: null,
    }], warnings: [] })

    const result = await searchSalesAgentCatalog({ productTypes: ['ACCESSORY'], limit: 8 })

    expect(result.map((item) => item.productType)).toEqual(['ACCESSORY'])
    expect(mocks.discoverAccessories).toHaveBeenCalledWith({ query: undefined, minPrice: undefined, maxPrice: undefined, limit: 8 })
  })

  it('uses the shared vehicle read contract and accepts legacy database types', async () => {
    const { getSupabaseAdmin } = await import('@/lib/supabase-admin')
    const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), gte: vi.fn(), lte: vi.fn(), textSearch: vi.fn(), ilike: vi.fn(), order: vi.fn(), limit: vi.fn() }
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.in.mockReturnValue(query); query.gte.mockReturnValue(query); query.lte.mockReturnValue(query); query.textSearch.mockReturnValue(query); query.ilike.mockReturnValue(query); query.order.mockReturnValue(query); query.limit.mockResolvedValue({ data: [], error: null })
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: vi.fn().mockReturnValue(query) } as any)

    await searchSalesAgentCatalog({ productTypes: ['BIKE'] })

    expect(query.in).toHaveBeenCalledWith('product_type', ['BIKE', 'MOTORBIKE'])
    expect(query.select.mock.calls[0]?.[0]).toContain('product_variants')
    expect(query.select.mock.calls[0]?.[0]).toContain('vehicle_variants')
    expect(query.select.mock.calls[0]?.[0]).not.toContain('inventory_items')
  })
})
