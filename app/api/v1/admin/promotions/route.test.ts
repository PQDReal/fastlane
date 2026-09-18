import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiAuthError } from '@/lib/auth/errors'

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

import { GET, POST } from '@/app/api/v1/admin/promotions/route'

const promotionRow = {
  id: '123e4567-e89b-12d3-a456-426614174001',
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
  return new Request('http://localhost/api/v1/admin/promotions', {
    method,
    headers: body === undefined
      ? undefined
      : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function validCreateBody() {
  return {
    code: ' save10 ',
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
  }
}

describe('Admin Promotions collection API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue(undefined)
  })

  it('requires the Admin Promotion authorization policy', async () => {
    mocks.authorize.mockRejectedValue(
      new ApiAuthError(
        403,
        'INSUFFICIENT_PERMISSION',
        'Promotion permission is required.',
      ),
    )

    const response = await GET(request())

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INSUFFICIENT_PERMISSION' },
    })
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled()
  })

  it('lists promotions using the current product-types column', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [promotionRow],
      error: null,
    })
    const select = vi.fn().mockReturnValue({ order })
    mocks.getSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue({ select }),
    })

    const response = await GET(request())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([promotionRow])
    expect(select).toHaveBeenCalledWith(
      expect.stringContaining('applicable_product_types'),
    )
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('maps the legacy product type when the current column is unavailable', async () => {
    const currentOrder = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST204',
        message: 'applicable_product_types does not exist',
      },
    })
    const legacyRow = {
      ...promotionRow,
      applicable_product_type: 'ACCESSORY',
    }
    delete (legacyRow as Partial<typeof legacyRow>).applicable_product_types
    const legacyOrder = vi.fn().mockResolvedValue({
      data: [legacyRow],
      error: null,
    })
    const select = vi.fn()
      .mockReturnValueOnce({ order: currentOrder })
      .mockReturnValueOnce({ order: legacyOrder })
    mocks.getSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue({ select }),
    })

    const response = await GET(request())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data[0].applicable_product_types).toEqual(['ACCESSORY'])
    expect(data[0]).not.toHaveProperty('applicable_product_type')
  })

  it('returns 500 when current and legacy reads both fail', async () => {
    const select = vi.fn()
      .mockReturnValueOnce({
        order: vi.fn().mockResolvedValue({
          data: null,
          error: {
            code: 'PGRST204',
            message: 'applicable_product_types does not exist',
          },
        }),
      })
      .mockReturnValueOnce({
        order: vi.fn().mockResolvedValue({
          data: null,
          error: { code: 'XX000', message: 'database failure' },
        }),
      })
    mocks.getSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue({ select }),
    })

    const response = await GET(request())

    expect(response.status).toBe(500)
  })

  it('creates and normalizes a promotion', async () => {
    const single = vi.fn().mockResolvedValue({
      data: promotionRow,
      error: null,
    })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    mocks.getSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue({ insert }),
    })

    const response = await POST(request('POST', { ...validCreateBody(), isPublic: false }))

    expect(response.status).toBe(201)
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'SAVE10',
        applicable_product_types: ['ACCESSORY'],
        applicable_product_type: 'ACCESSORY',
        is_public: false,
      }),
    )
  })

  it('rejects invalid create input before accessing the database', async () => {
    const response = await POST(request('POST', {
      ...validCreateBody(),
      value: 101,
    }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('không vượt quá 100'),
    })
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled()
  })

  it('returns 409 for a duplicate promotion code', async () => {
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    })
    mocks.getSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({ single }),
        }),
      }),
    })

    const response = await POST(request('POST', validCreateBody()))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'Mã khuyến mãi đã tồn tại.',
    })
  })
})
