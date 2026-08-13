import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getSupabaseAdmin: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }))

import { discoverSalesAgentAccessories } from './accessories'

function query(data: unknown, error: null | { message: string } = null) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn(),
  }
  builder.select.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.limit.mockResolvedValue({ data, error })
  return builder
}

describe('sales agent accessory discovery', () => {
  beforeEach(() => vi.clearAllMocks())

  it('marks collection membership as catalog association, never verified fitment', async () => {
    const builder = query([{
      id: 'a1',
      name: 'Thảm sàn VF 8',
      slug: 'tham-san-vf-8',
      description: null,
      displayed_price: 100,
      updated_at: '2026-08-12T00:00:00.000Z',
      product_variants: [{ original_price: 100, sale_price: null, is_active: true, inventory_items: { on_hand_quantity: 2, updated_at: null } }],
      collection_memberships: [{ source_system: 'admin', is_active: true, collection: { kind: 'MODEL', vehicle_filter_mode: 'COLLECTION_MEMBERSHIP' } }],
    }])
    mocks.getSupabaseAdmin.mockReturnValue({ from: vi.fn().mockReturnValue(builder) })

    const result = await discoverSalesAgentAccessories({ query: 'VF 8' })

    expect(result.items[0]?.associationStatus).toBe('CATALOG_ASSOCIATION')
    expect(JSON.stringify(result)).not.toContain('VERIFIED')
  })

  it('returns unknown association and an explicit mapping warning for a vehicle product', async () => {
    const builder = query([{
      id: 'a1', name: 'Sạc', slug: 'sac', description: null, displayed_price: 100, updated_at: null,
      product_variants: [{ original_price: 100, sale_price: null, is_active: true, inventory_items: null }],
      collection_memberships: [],
    }])
    mocks.getSupabaseAdmin.mockReturnValue({ from: vi.fn().mockReturnValue(builder) })

    const result = await discoverSalesAgentAccessories({ vehicleProductId: 'p1' })

    expect(result.items[0]?.associationStatus).toBe('UNKNOWN')
    expect(result.items[0]?.availability).toBe('UNKNOWN')
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'VEHICLE_MODEL_MAPPING_MISSING' }))
  })

  it('keeps the accessory read select explicit so price, inventory and association facts stay auditable', async () => {
    const builder = query([])
    mocks.getSupabaseAdmin.mockReturnValue({ from: vi.fn().mockReturnValue(builder) })

    await discoverSalesAgentAccessories({ query: 'sạc' })

    expect(builder.select.mock.calls[0]?.[0]).toContain('product_variants')
    expect(builder.select.mock.calls[0]?.[0]).toContain('product_collection_memberships')
    expect(builder.eq).toHaveBeenCalledWith('product_type', 'ACCESSORY')
  })

  it('keeps a category-only accessory browse bounded and grounded when no vehicle is supplied', async () => {
    const builder = query([
      {
        id: 'a1', name: 'Sạc treo tường', slug: 'sac-treo-tuong', description: null,
        displayed_price: 10_000_000, updated_at: null,
        product_variants: [{ original_price: 10_000_000, sale_price: null, is_active: true, inventory_items: null }],
        collection_memberships: [],
      },
    ])
    mocks.getSupabaseAdmin.mockReturnValue({ from: vi.fn().mockReturnValue(builder) })

    const result = await discoverSalesAgentAccessories({ query: 'phụ kiện', limit: 1 })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.associationStatus).toBe('UNKNOWN')
    expect(result.items[0]?.availability).toBe('UNKNOWN')
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'INVENTORY_UNKNOWN' }))
  })
})
