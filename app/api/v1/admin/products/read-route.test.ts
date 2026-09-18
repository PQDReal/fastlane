import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/admin', () => ({
  authorizeAdminCatalogRequest: mocks.authorize,
}))
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}))

import { GET } from './route'

function productQuery() {
  const result = {
    data: [{
      id: '11111111-1111-4111-8111-111111111111',
      category_id: '22222222-2222-4222-8222-222222222222',
      name: 'VinFast VF 8',
      slug: 'vinfast-vf-8',
      product_type: 'CAR',
      displayed_price: 1_000_000_000,
      is_active: true,
      created_at: '2026-08-17T00:00:00.000Z',
      image_urls: ['https://cdn.example.com/vf8.webp'],
      categories: [{ name: 'Ô tô điện' }],
    }],
    error: null,
    count: 1,
  }
  const query: Record<string, any> = {
    select: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    eq: vi.fn(),
    textSearch: vi.fn(),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  }
  for (const method of ['select', 'order', 'range', 'eq', 'textSearch']) {
    query[method].mockReturnValue(query)
  }
  return query
}

describe('GET /api/v1/admin/products', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue(undefined)
  })

  it('selects only list fields and uses the inventory summary RPC', async () => {
    const query = productQuery()
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        productId: '11111111-1111-4111-8111-111111111111',
        activeSku: 'CAR-VF8-ECO-WHITE',
        inventoryQuantity: 7,
        inventoryVariantCount: 2,
      }],
      error: null,
    })
    mocks.getSupabaseAdmin.mockReturnValue({ from: vi.fn().mockReturnValue(query), rpc })

    const response = await GET(new Request('http://localhost/api/v1/admin/products?page=1&limit=10'))
    const body = await response.json()
    const selectedColumns = String(query.select.mock.calls[0][0])

    expect(response.status).toBe(200)
    expect(selectedColumns).not.toMatch(/(^|\s|,)\*(\s|,|$)/)
    expect(selectedColumns).not.toContain('specifications')
    expect(selectedColumns).not.toContain('service_label_assignments')
    expect(rpc).toHaveBeenCalledWith('get_admin_product_inventory_summary', {
      p_product_ids: ['11111111-1111-4111-8111-111111111111'],
    })
    expect(body.data[0]).toMatchObject({
      category: 'Ô tô điện',
      sku: 'CAR-VF8-ECO-WHITE',
      inventory_quantity: 7,
      inventory_variant_count: 2,
    })
    expect(body.data[0]).not.toHaveProperty('categories')
    expect(response.headers.get('x-fastlane-inventory-summary-source')).toBe('rpc')
    expect(response.headers.get('server-timing')).toMatch(/db_products;dur=/)
    expect(response.headers.get('server-timing')).toMatch(/db_inventory_summary;dur=/)
  })

  it('fails closed instead of loading whole variant tables when the RPC is unavailable', async () => {
    const query = productQuery()
    const from = vi.fn().mockReturnValue(query)
    mocks.getSupabaseAdmin.mockReturnValue({
      from,
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'RPC missing' } }),
    })

    const response = await GET(new Request('http://localhost/api/v1/admin/products'))

    expect(response.status).toBe(503)
    expect(from).toHaveBeenCalledTimes(1)
  })
})
