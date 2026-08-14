import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { browseCatalogRepository } from './browse'
import { resolveCatalogEntitiesRepository } from './identity'
import { getProductDetailsRepository } from './product-details'

vi.mock('@/lib/supabase-admin', () => {
  const mockProducts = [
    {
      id: 'prod-vf8',
      name: 'VinFast VF 8',
      slug: 'vf-8',
      description: 'Mẫu SUV điện phân khúc D đẳng cấp',
      product_type: 'CAR',
      displayed_price: 1090000000,
      specifications: { seats: '5', range_km: '471', power_hp: '402' },
      is_active: true,
      updated_at: '2026-08-01T00:00:00Z',
      product_variants: [
        { id: 'v1', name: 'VF 8 Eco', sku: 'VF8-ECO', original_price: 1090000000, sale_price: 1090000000, is_active: true },
        { id: 'v2', name: 'VF 8 Plus', sku: 'VF8-PLUS', original_price: 1270000000, sale_price: 1270000000, is_active: true },
      ],
      vehicle_variants: [
        { id: 'vv1', product_variant_id: 'v1', version: 'Eco', color: 'Trắng', is_active: true },
      ],
    },
    {
      id: 'prod-evo200',
      name: 'VinFast Evo200',
      slug: 'evo-200',
      description: 'Xe máy điện quốc dân',
      product_type: 'BIKE',
      displayed_price: 18000000,
      specifications: { range_km: '203', top_speed_kmh: '70' },
      is_active: true,
      updated_at: '2026-08-01T00:00:00Z',
      product_variants: [
        { id: 'v3', name: 'Evo200 Base', sku: 'EVO200-BASE', original_price: 18000000, sale_price: 18000000, is_active: true },
      ],
      vehicle_variants: [],
    },
  ]

  const createQueryChain = (data: any = mockProducts) => {
    let result = [...data]
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockImplementation((field: string, val: any) => {
        result = result.filter((item) => item[field] === val)
        return chain
      }),
      in: vi.fn().mockImplementation((field: string, vals: any[]) => {
        result = result.filter((item) => vals.includes(item[field]))
        return chain
      }),
      gte: vi.fn().mockImplementation((field: string, val: number) => {
        result = result.filter((item) => Number(item[field]) >= val)
        return chain
      }),
      lte: vi.fn().mockImplementation((field: string, val: number) => {
        result = result.filter((item) => Number(item[field]) <= val)
        return chain
      }),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => Promise.resolve({ data: result, error: null })),
      then: vi.fn().mockImplementation((resolve) => resolve({ data: result, error: null })),
    }
    return chain
  }

  return {
    getSupabaseAdmin: () => ({
      from: vi.fn().mockImplementation(() => createQueryChain()),
    }),
  }
})

describe('Canonical Catalog Repositories', () => {
  it('browseCatalogRepository retrieves active items and computes effective variant prices', async () => {
    const res = await browseCatalogRepository(
      {
        productTypes: ['CAR'],
        sort: { field: 'PRICE', direction: 'ASC' },
        page: { limit: 5 },
      },
      'call-test-browse',
    )

    expect(res.outcome).toBe('SUCCESS')
    if (res.outcome === 'SUCCESS') {
      expect(res.data.items.length).toBe(1)
      expect(res.data.items[0].name).toBe('VinFast VF 8')
      expect(res.data.items[0].price).toBe(1090000000)
      expect(res.evidence.length).toBe(1)
      expect(res.evidence[0].facts.some((f) => f.factPath === 'pricing.effectivePrice')).toBe(true)
    }
  })

  it('resolveCatalogEntitiesRepository resolves short model names to canonical IDs', async () => {
    const res = await resolveCatalogEntitiesRepository(
      {
        references: [
          { clientRef: 'ref-1', mention: 'VF 8', kindHint: 'PRODUCT' },
        ],
      },
      'call-test-resolve',
    )

    expect(res.outcome).toBe('SUCCESS')
    if (res.outcome === 'SUCCESS') {
      expect(res.data.resolutions.length).toBe(1)
      const r = res.data.resolutions[0]
      expect(r.outcome).toBe('RESOLVED')
      if (r.outcome === 'RESOLVED') {
        expect(r.entity.id).toBe('prod-vf8')
        expect(r.entity.name).toBe('VinFast VF 8')
        expect(r.matchKind).toBe('SLUG_EXACT')
      }
    }
  })

  it('resolveCatalogEntitiesRepository returns NO_MATCH for non-existent models', async () => {
    const res = await resolveCatalogEntitiesRepository(
      {
        references: [
          { clientRef: 'ref-2', mention: 'VF 99' },
        ],
      },
      'call-test-resolve-unknown',
    )

    expect(res.outcome).toBe('NO_MATCH')
    expect(res.issues[0].code).toBe('UNKNOWN_ENTITY_REFERENCE')
  })
})
