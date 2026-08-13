import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getSupabaseAdmin: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }))

import { getCurrentSalesAgentPromotions } from './promotions'

function query(data: unknown, error: null | { message: string } = null) {
  const builder = { select: vi.fn(), eq: vi.fn() }
  builder.select.mockReturnValue(builder)
  builder.eq.mockResolvedValue({ data, error })
  return builder
}

describe('sales agent current promotions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('filters by time, public scope, usage and product type', async () => {
    const builder = query([
      { id: 'p1', code: 'PUBLIC_CAR', name: 'Car', description: null, type: 'FIXED', value: 10, applicable_product_types: ['CAR'], is_public: true, target_user_id: null, starts_at: '2026-01-01T00:00:00.000Z', ends_at: '2027-01-01T00:00:00.000Z', is_active: true, usage_limit: null, used_count: 0 },
      { id: 'p2', code: 'PRIVATE_CAR', name: 'Private', description: null, type: 'FIXED', value: 10, applicable_product_types: ['CAR'], is_public: false, target_user_id: null, starts_at: '2026-01-01T00:00:00.000Z', ends_at: '2027-01-01T00:00:00.000Z', is_active: true, usage_limit: null, used_count: 0 },
      { id: 'p3', code: 'EXPIRED', name: 'Expired', description: null, type: 'FIXED', value: 10, applicable_product_types: ['CAR'], is_public: true, target_user_id: null, starts_at: '2025-01-01T00:00:00.000Z', ends_at: '2026-01-01T00:00:00.000Z', is_active: true, usage_limit: null, used_count: 0 },
    ])
    mocks.getSupabaseAdmin.mockReturnValue({ from: vi.fn().mockReturnValue(builder) })

    const result = await getCurrentSalesAgentPromotions({ productType: 'CAR' }, new Date('2026-08-12T00:00:00.000Z'))

    expect(result.items.map((item) => item.code)).toEqual(['PUBLIC_CAR'])
    expect(result.items[0]?.applicability).toBe('TYPE_LEVEL_ONLY')
  })
})
