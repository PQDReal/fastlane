import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type { CachedCatalogSnapshot } from './catalog-cache'
import { buildCatalogPromptContext, compileCompactCatalogContext } from './catalog-context'

const snapshot: CachedCatalogSnapshot = {
  products: [
    {
      id: 'vf5',
      name: 'VinFast VF 5 Plus',
      slug: 'vinfast-vf-5-plus',
      description: null,
      productType: 'CAR',
      displayedPrice: 468000000,
      thumbnailUrl: null,
      imageUrls: [],
      specifications: {
        seats: '5',
        battery_kwh: '37.23',
        range_km: '326',
        power_kw: '100',
        fast_charge_min: '30',
        warranty_vehicle: '10 năm / 200.000 km',
        warranty_battery: '10 năm không giới hạn km',
      },
      updatedAt: '2026-08-21T00:00:00.000Z',
      variants: [],
      vehicleVariants: [],
    },
    {
      id: 'vf9',
      name: 'VinFast VF 9',
      slug: 'vinfast-vf-9',
      description: null,
      productType: 'CAR',
      displayedPrice: 1984000000,
      thumbnailUrl: null,
      imageUrls: [],
      specifications: { seats: '7', battery_kwh: '123', range_km: '626' },
      updatedAt: '2026-08-21T00:00:00.000Z',
      variants: [],
      vehicleVariants: [],
    },
  ],
  accessories: [],
  lastRefreshedAt: Date.parse('2026-08-21T00:00:00.000Z'),
  isSeededFallback: false,
}

describe('compact catalog prompt context', () => {
  it('keeps synced product facts while excluding legacy policy and knowledge prose', () => {
    const context = compileCompactCatalogContext(snapshot, { mode: 'FACTS' })

    expect(context).toContain('status=SYNCED')
    expect(context).toContain('price_vnd')
    expect(context).toContain('468000000')
    expect(context).not.toContain('Cẩm nang')
    expect(context).not.toContain('Chính sách cốt lõi')
    expect(context.length).toBeLessThan(1800)
  })

  it('uses only the model index for technical questions', () => {
    const context = buildCatalogPromptContext('cách kết nối wifi trên VF5', snapshot)

    expect(context).toContain('INDEX:')
    expect(context).toContain('VF 5 Plus')
    expect(context).not.toContain('price_vnd')
  })

  it('selects only explicitly mentioned models for direct fact questions', () => {
    const context = buildCatalogPromptContext('giá VF5 hiện tại', snapshot)

    expect(context).toContain('price_vnd')
    expect(context).toContain('468000000')
    expect(context).not.toContain('1984000000')
  })

  it('does not expose fallback seed facts as current values', () => {
    const context = compileCompactCatalogContext({
      ...snapshot,
      lastRefreshedAt: 0,
      isSeededFallback: true,
    }, { mode: 'FACTS' })

    expect(context).toContain('status=INDEX_ONLY')
    expect(context).not.toContain('price_vnd')
    expect(context).not.toContain('468000000')
  })

  it('does not touch the catalog for unrelated questions', () => {
    expect(buildCatalogPromptContext('cách bật điều hòa', snapshot)).toBe('')
  })
})
