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

  it('marks an empty category search as a grounded not-found result', async () => {
    mocks.search.mockResolvedValue([])

    const result = await executeSalesAgentTool('search_catalog', { query: 'xe máy điện', productTypes: ['BIKE'] })

    expect(result).toMatchObject({ tool: 'search_catalog', status: 'NOT_FOUND', data: { items: [] } })
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'PRODUCT_NOT_FOUND' }))
  })

  it('keeps mixed vehicle comparison ambiguous and does not overclaim compatibility', async () => {
    mocks.snapshots.mockResolvedValue([
      { productId: id, productType: 'CAR', warnings: [], name: 'VF 8' },
      { productId: `${id.slice(0, -1)}2`, productType: 'BIKE', warnings: [], name: 'Evo Grand' },
    ])

    const result = await executeSalesAgentTool('compare_vehicles', { productIds: [id, `${id.slice(0, -1)}2`] })

    expect(result.status).toBe('AMBIGUOUS')
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'INCOMPATIBLE_PRODUCT_TYPES' }))
  })

  it('returns requested comparison criteria and explicitly reports missing fields', async () => {
    mocks.snapshots.mockResolvedValue([
      {
        productId: id,
        productType: 'CAR',
        warnings: [],
        name: 'VF 8',
        pricing: { from: 1, currency: 'VND' },
        availability: { state: 'IN_STOCK', availableQuantity: 2 },
        specs: {},
      },
      {
        productId: `${id.slice(0, -1)}2`,
        productType: 'CAR',
        warnings: [],
        name: 'VF 7',
        pricing: { from: 2, currency: 'VND' },
        availability: { state: 'IN_STOCK', availableQuantity: 1 },
        specs: {},
      },
    ])

    const result = await executeSalesAgentTool('compare_vehicles', {
      productIds: [id, `${id.slice(0, -1)}2`],
      criteria: ['price', 'battery_capacity_kwh'],
    })

    expect(result.status).toBe('PARTIAL')
    expect(result.data).toMatchObject({
      criteria: ['price', 'battery_capacity_kwh'],
      missingCriteria: [
        { productId: id, criteria: ['battery_capacity_kwh'] },
        { productId: `${id.slice(0, -1)}2`, criteria: ['battery_capacity_kwh'] },
      ],
    })
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'MISSING_COMPARE_CRITERIA' }))
  })
})
