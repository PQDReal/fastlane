import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type { CachedCatalogSnapshot } from './catalog-cache'
import { compileCompactCatalogContext, CATALOG_CONTEXT_CHAR_BUDGET, CATALOG_INDEX_CHAR_BUDGET } from './catalog-context'

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
  it('builds an index-only capability context without product facts by default', () => {
    const context = compileCompactCatalogContext(snapshot, { mode: 'INDEX' })

    expect(context).toContain('status=SYNCED')
    expect(context).toContain('INDEX:')
    expect(context).toContain('VF 5 Plus')
    expect(context).toContain('VF 9')
    expect(context).not.toContain('price_vnd')
    expect(context).not.toContain('468000000')
  })

  it('keeps synced product facts while excluding legacy policy and knowledge prose in FACTS mode', () => {
    const context = compileCompactCatalogContext(snapshot, { mode: 'FACTS' })

    expect(context).toContain('status=SYNCED')
    expect(context).toContain('price_vnd')
    expect(context).toContain('468000000')
    expect(context).toContain('1984000000')
    expect(context).not.toContain('Cẩm nang')
    expect(context).not.toContain('Chính sách cốt lõi')
    expect(context.length).toBeLessThan(1800)
  })

  it('allows targeted facts for specified productIds', () => {
    const context = compileCompactCatalogContext(snapshot, { mode: 'FACTS', productIds: ['vf5'] })

    expect(context).toContain('price_vnd')
    expect(context).toContain('468000000')
    expect(context).not.toContain('1984000000')
  })

  it('keeps the compact snapshot within its hard character budget', () => {
    const largeSnapshot = {
      ...snapshot,
      products: Array.from({ length: 80 }, (_, index) => ({
        ...snapshot.products[0],
        id: `vf5-${index}`,
        name: `VinFast VF 5 Plus ${index}`,
      })),
    }
    const context = compileCompactCatalogContext(largeSnapshot, { mode: 'FACTS' })
    expect(context.length).toBeLessThanOrEqual(CATALOG_CONTEXT_CHAR_BUDGET)
    expect(context).toContain('[/CATALOG_SNAPSHOT]')
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
})

