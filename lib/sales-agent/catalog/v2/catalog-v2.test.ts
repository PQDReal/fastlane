import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
import { browseCatalogRepository } from './browse-repository'
import { resolveCatalogEntitiesRepository } from './identity-repository'

vi.mock('@/lib/supabase-admin', () => {
  const mockProducts = [
    {
      id: 'vf-8-id',
      name: 'VinFast VF 8',
      slug: 'vf-8',
      description: 'Mẫu SUV điện phân khúc D',
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
      id: 'vf-5-id',
      name: 'VinFast VF 5 Plus',
      slug: 'vf-5-plus',
      description: 'SUV đô thị cỡ A',
      product_type: 'CAR',
      displayed_price: 468000000,
      specifications: { seats: '5', range_km: '326', power_hp: '134' },
      is_active: true,
      updated_at: '2026-08-01T00:00:00Z',
      product_variants: [
        { id: 'v3', name: 'VF 5 Plus Base', sku: 'VF5-PLUS', original_price: 468000000, sale_price: 468000000, is_active: true },
      ],
      vehicle_variants: [],
    },
    {
      id: 'klara-s-id',
      name: 'VinFast Klara S',
      slug: 'klara-s-2022',
      description: 'Xe máy điện thanh lịch',
      product_type: 'BIKE',
      displayed_price: 35000000,
      specifications: { range_km: '194', top_speed_kmh: '78' },
      is_active: true,
      updated_at: '2026-08-01T00:00:00Z',
      product_variants: [
        { id: 'v4', name: 'Klara S', sku: 'KLARA-S', original_price: 35000000, sale_price: 35000000, is_active: true },
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

describe('Catalog V2 Repositories', () => {
  it('browseCatalogRepository retrieves active products with typed filters', async () => {
    const result = await browseCatalogRepository(
      {
        productTypes: ['CAR'],
        price: { currency: 'VND', min: 400000000, max: 1500000000 },
        sort: { field: 'PRICE', direction: 'ASC' },
        page: { limit: 5 },
      },
      'call-browse-1',
    )

    expect(result.outcome).toBe('SUCCESS')
    if (result.outcome === 'SUCCESS') {
      expect(result.data.items.length).toBeGreaterThan(0)
      expect(result.data.items.every((item) => item.productType === 'CAR')).toBe(true)
      expect(result.data.factPointers.length).toBeGreaterThan(0)
      expect(result.evidence.length).toBeGreaterThan(0)
    }
  })

  it('resolveCatalogEntitiesRepository resolves known entity VF 8', async () => {
    const result = await resolveCatalogEntitiesRepository(
      {
        references: [{ clientRef: 'ref-1', mention: 'VF 8', kindHint: 'PRODUCT' }],
      },
      'call-resolve-1',
    )

    expect(result.outcome).toBe('SUCCESS')
    if (result.outcome === 'SUCCESS') {
      expect(result.data.resolutions.length).toBe(1)
      const res = result.data.resolutions[0]
      expect(res.outcome).toBe('RESOLVED')
      if (res.outcome === 'RESOLVED') {
        expect(res.entity.id).toBe('vf-8-id')
        expect(res.entity.name).toBe('VinFast VF 8')
      }
    }
  })

  it('resolveCatalogEntitiesRepository returns NO_MATCH for unknown model VF 99', async () => {
    const result = await resolveCatalogEntitiesRepository(
      {
        references: [{ clientRef: 'ref-1', mention: 'VF 99' }],
      },
      'call-resolve-2',
    )

    expect(result.outcome).toBe('NO_MATCH')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues[0].code).toBe('UNKNOWN_ENTITY_REFERENCE')
  })
})
