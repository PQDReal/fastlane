import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  rpc: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  loadLegacyAdminInventory: vi.fn(),
  queryLegacyAdminInventory: vi.fn(),
  legacyAdminInventoryFilterOptions: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/admin', () => ({
  authorizeAdminInventoryRequest: mocks.authorize,
}))
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}))
vi.mock('@/lib/admin-inventory-legacy', () => ({
  loadLegacyAdminInventory: mocks.loadLegacyAdminInventory,
  queryLegacyAdminInventory: mocks.queryLegacyAdminInventory,
  legacyAdminInventoryFilterOptions: mocks.legacyAdminInventoryFilterOptions,
}))

import { GET as getFilterOptions } from '../filter-options/route'
import { GET as getInventory } from './route'

const inventoryData = {
  items: [],
  nextCursor: null,
  hasMore: false,
  limit: 10,
  summary: { totalRows: 0, totalQuantity: 0, statusCounts: {} },
}

const filterData = {
  typeCounts: { ALL: 0, CAR: 0, BIKE: 0, ACCESSORY: 0 },
  products: [],
  variants: [],
  colors: [],
  interiorColors: [],
}

describe('admin inventory RPC split', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue(undefined)
    mocks.getSupabaseAdmin.mockReturnValue({ rpc: mocks.rpc })
    mocks.loadLegacyAdminInventory.mockResolvedValue([])
    mocks.queryLegacyAdminInventory.mockReturnValue(inventoryData)
    mocks.legacyAdminInventoryFilterOptions.mockReturnValue(filterData)
    mocks.rpc.mockImplementation(async (name: string) => ({
      data: name === 'list_admin_inventory' ? inventoryData : filterData,
      error: null,
    }))
  })

  it('does not reload filter metadata for cursor-page requests that opt out', async () => {
    const response = await getInventory(new Request(
      'http://localhost/api/v1/admin/inventory/query?limit=10&includeFilterOptions=false',
    ))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledWith('list_admin_inventory', expect.any(Object))
    expect(body.data).not.toHaveProperty('filterOptions')
    expect(response.headers.get('server-timing')).toMatch(/db_inventory;dur=/)
  })

  it('keeps the old combined response by default', async () => {
    const response = await getInventory(new Request('http://localhost/api/v1/admin/inventory/query?limit=10'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
    expect(body.data.filterOptions).toEqual(filterData)
  })

  it('loads stable filter options from the independent endpoint', async () => {
    const response = await getFilterOptions(new Request(
      'http://localhost/api/v1/admin/inventory/filter-options?productType=CAR',
    ))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ data: filterData })
    expect(mocks.rpc).toHaveBeenCalledWith('get_admin_inventory_filter_options', {
      p_product_type: 'CAR',
      p_product_id: null,
    })
    expect(response.headers.get('server-timing')).toMatch(/db_filter_options;dur=/)
  })

  it('keeps inventory usable when migration 057 is not installed yet', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'RPC missing' } })

    const response = await getInventory(new Request(
      'http://localhost/api/v1/admin/inventory/query?limit=10&includeFilterOptions=false',
    ))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-fastlane-inventory-source')).toBe('legacy')
    expect(mocks.loadLegacyAdminInventory).toHaveBeenCalledOnce()
    expect(mocks.queryLegacyAdminInventory).toHaveBeenCalledOnce()
  })

  it('keeps filter metadata usable when migration 057 is not installed yet', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'RPC missing' } })

    const response = await getFilterOptions(new Request(
      'http://localhost/api/v1/admin/inventory/filter-options?productType=BIKE',
    ))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-fastlane-inventory-source')).toBe('legacy')
    expect(mocks.legacyAdminInventoryFilterOptions).toHaveBeenCalledWith([], 'BIKE', null)
  })
})
