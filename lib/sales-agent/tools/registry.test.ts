import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  resolveVehicles: vi.fn(),
  snapshot: vi.fn(),
  snapshots: vi.fn(),
  promotions: vi.fn(),
  accessories: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('../catalog/context', () => ({
  searchSalesAgentCatalog: mocks.search,
  resolveSalesAgentVehicleReferences: mocks.resolveVehicles,
  getSalesAgentVehicleSnapshot: mocks.snapshot,
  getSalesAgentVehicleSnapshots: mocks.snapshots,
}))
vi.mock('../catalog/promotions', () => ({ getCurrentSalesAgentPromotions: mocks.promotions }))
vi.mock('../catalog/accessories', () => ({ discoverSalesAgentAccessories: mocks.accessories }))

import { executeSalesAgentTool } from './registry'

const id = '00000000-0000-0000-0000-000000000001'

describe('sales agent tool registry', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the common envelope for catalog search', async () => {
    mocks.search.mockResolvedValue([{ id, name: 'VF 8', slug: 'vf-8', productType: 'CAR', price: 1, availableQuantity: null, availability: 'UNKNOWN', facts: {}, dataAsOf: '2026-08-12T00:00:00.000Z', sourceUpdatedAt: null }])

    const result = await executeSalesAgentTool('search_catalog', { query: 'VF 8' })

    expect(result).toMatchObject({ tool: 'search_catalog', schemaVersion: '1.0', status: 'PARTIAL', data: { items: [{ id }] }, evidence: [{ source: 'products/product_variants/inventory_items', entityIds: [id] }] })
    expect(result.readAt).toEqual(expect.any(String))
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'INVENTORY_UNKNOWN' }))
  })

  it('returns canonical vehicle IDs for the model-native resolver tool', async () => {
    mocks.resolveVehicles.mockResolvedValue([{ id, name: 'VinFast VF 8', slug: 'vinfast-vf-8', productType: 'CAR' }])

    const result = await executeSalesAgentTool('resolve_vehicle_references', { query: 'VF8' })

    expect(result).toMatchObject({
      tool: 'resolve_vehicle_references',
      status: 'OK',
      data: { vehicles: [{ id, name: 'VinFast VF 8', productType: 'CAR' }] },
      evidence: [{ source: 'products', entityIds: [id] }],
    })
  })

  it('does not expose fuzzy detail resolution', async () => {
    const result = await executeSalesAgentTool('get_vehicle_details', { productId: 'VF 8' })

    expect(result.status).toBe('AMBIGUOUS')
    expect(mocks.snapshot).not.toHaveBeenCalled()
  })
})
