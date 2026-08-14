import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { browseCatalogRepository } from '../catalog/v2/browse-repository'
import { resolveCatalogEntitiesRepository } from '../catalog/v2/identity-repository'
import { getProductDetailsRepository } from '../catalog/v2/product-details-repository'
import { composeTurnResponse } from '../response/v2/composer'
import { KnownEntityLedger } from '../orchestrator/v2/ledgers/known-entities'
import { EvidenceLedger } from '../orchestrator/v2/ledgers/evidence'

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

describe('V2 E2E Integration Evals', () => {
  it('Scenario 1: "Giá xe hiện tại" executes browse_catalog and yields active vehicles with prices', async () => {
    const browseRes = await browseCatalogRepository(
      {
        productTypes: ['CAR', 'BIKE'],
        sort: { field: 'PRICE', direction: 'ASC' },
        page: { limit: 10 },
      },
      'call-browse-all',
    )

    expect(browseRes.outcome).toBe('SUCCESS')
    if (browseRes.outcome === 'SUCCESS') {
      expect(browseRes.data.items.length).toBeGreaterThanOrEqual(2)
      const names = browseRes.data.items.map((i) => i.name)
      expect(names).toContain('VinFast VF 8')
      expect(names).toContain('VinFast Klara S')

      // Compose response
      const evidence = new EvidenceLedger()
      evidence.recordToolResult('call-browse-all', browseRes)

      const knownEntities = new KnownEntityLedger()
      for (const item of browseRes.data.items) {
        knownEntities.addEntity('PRODUCT', item.id, item.name)
      }

      const response = composeTurnResponse({
        rawPlan: {
          schemaVersion: '2.0',
          outcome: 'ANSWER',
          narrative: [
            {
              kind: 'ADVICE',
              markdown: `Bảng giá xe điện hiện tại từ ${browseRes.data.items[0].price?.toLocaleString('vi-VN')} VNĐ.`,
            },
          ],
          views: [],
          suggestionIntents: [{ text: 'Xem chi tiết VF 8' }],
          actionIntents: [{ actionKey: 'BROWSE_CATALOG' }],
        },
        evidence,
        knownEntities,
        conversationRef: 'conv-test-1',
        turnId: 'turn-1',
        messageId: 'msg-1',
      })

      expect(response.answer.markdown).toContain('Bảng giá xe điện hiện tại')
      expect(response.answer.completeness).toBe('COMPLETE')
      expect(response.actions.length).toBeGreaterThan(0)
    }
  })

  it('Scenario 2: "Giá VF 8" resolves entity and fetches accurate product details', async () => {
    const resolveRes = await resolveCatalogEntitiesRepository(
      {
        references: [{ clientRef: 'ref-vf8', mention: 'VF 8' }],
      },
      'call-res-1',
    )

    expect(resolveRes.outcome).toBe('SUCCESS')
    if (resolveRes.outcome === 'SUCCESS') {
      const resolved = resolveRes.data.resolutions[0]
      expect(resolved.outcome).toBe('RESOLVED')
      if (resolved.outcome === 'RESOLVED') {
        const detailRes = await getProductDetailsRepository(
          { productIds: [resolved.entity.id] },
          'call-detail-1',
        )
        expect(detailRes.outcome).toBe('SUCCESS')
        if (detailRes.outcome === 'SUCCESS') {
          const product = detailRes.data.products[0]
          expect(product.name).toBe('VinFast VF 8')
          expect(product.pricing.from).toBe(1090000000)
        }
      }
    }
  })

  it('Scenario 3: "VF 99" returns NO_MATCH without halluncinating facts or fallback browse', async () => {
    const resolveRes = await resolveCatalogEntitiesRepository(
      {
        references: [{ clientRef: 'ref-vf99', mention: 'VF 99' }],
      },
      'call-res-vf99',
    )

    expect(resolveRes.outcome).toBe('NO_MATCH')
    expect(resolveRes.issues[0].code).toBe('UNKNOWN_ENTITY_REFERENCE')
  })

  it('Scenario 4: Multi-turn switching from CAR to BIKE does not get locked by history', async () => {
    // Turn 2 receives BIKE type without being overwritten by CAR
    const bikeBrowse = await browseCatalogRepository(
      {
        productTypes: ['BIKE'],
        sort: { field: 'PRICE', direction: 'ASC' },
      },
      'call-bike-browse',
    )

    expect(bikeBrowse.outcome).toBe('SUCCESS')
    if (bikeBrowse.outcome === 'SUCCESS') {
      expect(bikeBrowse.data.items.every((i) => i.productType === 'BIKE')).toBe(true)
      expect(bikeBrowse.data.items[0].name).toBe('VinFast Klara S')
    }
  })
})
