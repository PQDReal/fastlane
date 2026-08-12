import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminAccessoryWriteRequest } from '@/lib/catalog/admin-accessory-write'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  revalidateTag: vi.fn(),
  deleteRedisKey: vi.fn(),
  deleteRedisKeysByPrefix: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidateTag: mocks.revalidateTag }))
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({ rpc: mocks.rpc, from: mocks.from }),
}))
vi.mock('@/lib/redis', () => ({
  deleteRedisKey: mocks.deleteRedisKey,
  deleteRedisKeysByPrefix: mocks.deleteRedisKeysByPrefix,
}))

import {
  AdminAccessoryPersistenceError,
  saveAdminAccessoryProduct,
} from '@/lib/catalog/admin-accessory-server'

function request(): AdminAccessoryWriteRequest {
  return {
    expectedUpdatedAt: '2026-08-12T03:00:00.000000+00:00',
    categoryId: '11111111-1111-1111-1111-111111111111',
    templateCode: 'custom',
    templateVersion: 1,
    templateVersionId: null,
    categoryAssignments: [{
      categoryId: '22222222-2222-2222-2222-222222222222',
      compatibilityMode: 'ALL_MODELS',
      modelIds: [],
    }],
    name: 'Ốp gương',
    slug: 'op-guong',
    description: 'Phụ kiện chính hãng.',
    isActive: true,
    serviceLabelIds: [],
    content: { schema: 'accessory_content_v1', sections: [] },
    optionGroups: [],
    variants: [{
      name: 'Mặc định',
      originalPrice: 500000,
      salePrice: null,
      isActive: true,
      optionValues: {},
      imageUrls: ['https://cdn.example.com/sku.webp'],
    }],
  }
}

describe('saveAdminAccessoryProduct', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const productVariantsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [{
          id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          name: 'Mặc định',
          created_at: '2026-08-12T03:01:00.000000+00:00',
        }],
        error: null,
      }),
    }
    const inventoryItemsQuery = {
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }
    mocks.from.mockImplementation((table: string) => {
      if (table === 'product_variants') return productVariantsQuery
      if (table === 'inventory_items') return inventoryItemsQuery
      return {
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
    })
    mocks.deleteRedisKey.mockResolvedValue(undefined)
    mocks.deleteRedisKeysByPrefix.mockResolvedValue(undefined)
  })

  it('calls only the canonical accessory writer', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        productType: 'ACCESSORY',
        isActive: true,
        updatedAt: '2026-08-12T03:01:00.000000+00:00',
      },
      error: null,
    })

    await expect(saveAdminAccessoryProduct(
      request(),
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    )).resolves.toMatchObject({ isActive: true })

    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledWith('save_admin_accessory_product', expect.objectContaining({
      expected_updated_at: '2026-08-12T03:00:00.000000+00:00',
    }))
  })

  it('reports a missing canonical migration without falling back to versioned writers', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find save_admin_accessory_product' },
    })

    await expect(saveAdminAccessoryProduct(request(), null)).rejects.toMatchObject({
      status: 503,
      code: 'CATALOG_WRITE_MIGRATION_REQUIRED',
    } satisfies Partial<AdminAccessoryPersistenceError>)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
})
