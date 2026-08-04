import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/admin-promotions', () => ({
  authorizeAdminPromotionRequest: mocks.authorize,
}))
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}))

import {
  DELETE,
  GET,
  PATCH,
} from '@/app/api/v1/admin/promotions/[promotionId]/route'

const PROMOTION_ID = '123e4567-e89b-12d3-a456-426614174001'
const context = {
  params: Promise.resolve({ promotionId: PROMOTION_ID }),
}
const promotionRow = {
  id: PROMOTION_ID,
  code: 'SAVE10',
  name: 'Giảm 10%',
  description: null,
  type: 'PERCENT',
  value: 10,
  applicable_product_types: ['ACCESSORY'],
  max_discount_amount: null,
  minimum_order_amount: 0,
  usage_limit: 100,
  used_count: 0,
  starts_at: '2030-01-01T00:00:00.000Z',
  ends_at: '2030-02-01T00:00:00.000Z',
  is_active: true,
  created_at: '2026-07-29T00:00:00.000Z',
  updated_at: '2026-07-29T00:00:00.000Z',
}

function request(method = 'GET', body?: unknown) {
  return new Request(
    `http://localhost/api/v1/admin/promotions/${PROMOTION_ID}`,
    {
      method,
      headers: body === undefined
        ? undefined
        : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  )
}

function readChain(result: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue(result)
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  return { select, eq, maybeSingle }
}

function updateChain(result: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue(result)
  const select = vi.fn().mockReturnValue({ maybeSingle })
  const eq = vi.fn().mockReturnValue({ select })
  const update = vi.fn().mockReturnValue({ eq })
  return { update, eq, select, maybeSingle }
}

describe('Admin Promotion detail API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue(undefined)
  })

  it('gets a promotion by id', async () => {
    const chain = readChain({ data: promotionRow, error: null })
    mocks.getSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: chain.select }),
    })

    const response = await GET(request(), context)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(promotionRow)
    expect(chain.eq).toHaveBeenCalledWith('id', PROMOTION_ID)
  })

  it('maps a legacy promotion detail', async () => {
    const current = readChain({
      data: null,
      error: {
        code: 'PGRST204',
        message: 'applicable_product_types does not exist',
      },
    })
    const legacy = readChain({
      data: {
        ...promotionRow,
        applicable_product_types: undefined,
        applicable_product_type: 'ALL',
      },
      error: null,
    })
    const select = vi.fn()
      .mockImplementationOnce(current.select)
      .mockImplementationOnce(legacy.select)
    mocks.getSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue({ select }),
    })

    const response = await GET(request(), context)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.applicable_product_types).toEqual([
      'CAR',
      'BIKE',
      'ACCESSORY',
    ])
    expect(data).not.toHaveProperty('applicable_product_type')
  })

  it('returns 404 when a promotion does not exist', async () => {
    const chain = readChain({ data: null, error: null })
    mocks.getSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: chain.select }),
    })

    const response = await GET(request(), context)

    expect(response.status).toBe(404)
  })

  it('returns 500 when the detail read fails', async () => {
    const chain = readChain({
      data: null,
      error: { code: 'XX000', message: 'database failure' },
    })
    mocks.getSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: chain.select }),
    })

    const response = await GET(request(), context)

    expect(response.status).toBe(500)
  })

  it('patches promotion fields', async () => {
    const chain = updateChain({ data: promotionRow, error: null })
    mocks.getSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue({ update: chain.update }),
    })

    const response = await PATCH(request('PATCH', {
      code: 'SAVE10',
      name: 'Giảm 10%',
      description: '',
      type: 'PERCENT',
      value: 10,
      applicableProductTypes: ['ACCESSORY'],
      maxDiscountAmount: null,
      minimumOrderAmount: 0,
      usageLimit: 100,
      startsAt: '2030-01-01T00:00:00.000Z',
      endsAt: '2030-02-01T00:00:00.000Z',
      isActive: true,
      isPublic: false,
    }), context)

    expect(response.status).toBe(200)
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'SAVE10',
        applicable_product_types: ['ACCESSORY'],
        is_public: false,
      }),
    )
  })

  it('rejects an empty patch', async () => {
    const response = await PATCH(request('PATCH', {}), context)

    expect(response.status).toBe(400)
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled()
  })

  it('soft-deletes a promotion without removing its row', async () => {
    const chain = updateChain({
      data: { id: PROMOTION_ID },
      error: null,
    })
    mocks.getSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue({ update: chain.update }),
    })

    const response = await DELETE(request('DELETE'), context)

    expect(response.status).toBe(204)
    expect(chain.update).toHaveBeenCalledWith({
      is_active: false,
      updated_at: expect.any(String),
    })
    expect(chain.eq).toHaveBeenCalledWith('id', PROMOTION_ID)
    expect(chain.select).toHaveBeenCalledWith('id')
  })

  it('returns 404 when soft-deleting an unknown promotion', async () => {
    const chain = updateChain({ data: null, error: null })
    mocks.getSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue({ update: chain.update }),
    })

    const response = await DELETE(request('DELETE'), context)

    expect(response.status).toBe(404)
  })

  it('returns 500 when soft-delete fails', async () => {
    const chain = updateChain({
      data: null,
      error: { code: 'XX000', message: 'database failure' },
    })
    mocks.getSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue({ update: chain.update }),
    })

    const response = await DELETE(request('DELETE'), context)

    expect(response.status).toBe(500)
  })
})
