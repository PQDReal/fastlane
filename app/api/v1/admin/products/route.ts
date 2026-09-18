import { NextResponse } from 'next/server'

import { createServerTiming } from '@/lib/api/server-timing'
import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { toNamePrefixTsQuery } from '@/lib/catalog/search'
import {
  AdminAccessoryWriteValidationError,
  parseAdminAccessoryWriteRequest,
} from '@/lib/catalog/admin-accessory-write'
import {
  AdminAccessoryPersistenceError,
  saveAdminAccessoryProduct,
} from '@/lib/catalog/admin-accessory-server'
import {
  adminAccessoryErrorResponse,
  adminAccessoryPersistenceResponse,
  adminAccessoryValidationResponse,
} from '@/lib/catalog/admin-accessory-api'

type InventorySummary = {
  activeSku: string | null
  inventoryQuantity: number
  inventoryVariantCount: number
}

function handleAuthorizationError(error: unknown) {
  if (error instanceof ApiAuthError) return authErrorResponse(error)
  throw error
}

export async function GET(request: Request) {
  const timing = createServerTiming('route')
  const finish = <T extends Response>(response: T) => timing.attach(response)
  const authorizationStartedAt = performance.now()
  try {
    await authorizeAdminCatalogRequest(request, timing)
  } catch (error) {
    timing.measure('authorization', authorizationStartedAt)
    return finish(handleAuthorizationError(error))
  }
  timing.measure('authorization', authorizationStartedAt)

  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')
  const categoryId = searchParams.get('categoryId')
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') ?? '10', 10) || 10))
  const from = (page - 1) * limit
  const supabase = getSupabaseAdmin()

  const productsStartedAt = performance.now()
  let dbQuery = supabase
    .from('products')
    .select(`
      id,
      category_id,
      name,
      slug,
      product_type,
      displayed_price,
      is_active,
      created_at,
      image_urls,
      categories (
        name
      )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1)

  if (categoryId) {
    dbQuery = dbQuery.eq('category_id', categoryId)
  }

  const tsQuery = toNamePrefixTsQuery(query)
  if (tsQuery) dbQuery = dbQuery.textSearch('search_vector', tsQuery, { config: 'simple' })

  const { data, error, count } = await dbQuery
  timing.measure('db_products', productsStartedAt)

  if (error) {
    return finish(NextResponse.json({ error: error.message }, { status: 500 }))
  }

  const productRows = data ?? []
  const productIdentityRows = productRows.map((item) => ({ id: String(item.id), product_type: item.product_type }))
  const productIds = productIdentityRows.map((item) => item.id)
  let inventorySummaries = new Map<string, InventorySummary>()

  if (productIds.length > 0) {
    const summaryStartedAt = performance.now()
    const { data: summaryData, error: summaryError } = await supabase.rpc('get_admin_product_inventory_summary', {
      p_product_ids: productIds,
    })
    timing.measure('db_inventory_summary', summaryStartedAt)

    if (summaryError || !Array.isArray(summaryData)) {
      return finish(NextResponse.json({
        error: summaryError?.message ?? 'Phản hồi tổng hợp tồn kho không hợp lệ.',
      }, { status: 503 }))
    }

    inventorySummaries = new Map(summaryData.map((summary: {
      productId?: string
      activeSku?: string | null
      inventoryQuantity?: number
      inventoryVariantCount?: number
    }) => [String(summary.productId), {
      activeSku: summary.activeSku ?? null,
      inventoryQuantity: Number(summary.inventoryQuantity ?? 0) || 0,
      inventoryVariantCount: Number(summary.inventoryVariantCount ?? 0) || 0,
    }]))
  }

  const total = count ?? 0
  const transformStartedAt = performance.now()
  const response = NextResponse.json({
    data: productRows.map((item) => {
      const summary = inventorySummaries.get(String(item.id)) ?? { activeSku: null, inventoryQuantity: 0, inventoryVariantCount: 0 }
      const category = Array.isArray(item.categories) ? item.categories[0] : item.categories
      const { categories: _categories, ...product } = item
      return {
        ...product,
        category: category?.name || 'Chưa phân loại',
        sku: summary.activeSku,
        inventory_quantity: summary.inventoryQuantity,
        inventory_variant_count: summary.inventoryVariantCount,
      }
    }),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  })
  timing.measure('transform', transformStartedAt)
  response.headers.set('X-Fastlane-Inventory-Summary-Source', 'rpc')
  return finish(response)
}

export async function POST(request: Request) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    return handleAuthorizationError(error)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return adminAccessoryErrorResponse(400, 'VALIDATION_FAILED', 'Nội dung JSON không hợp lệ.', {
      field: { path: 'body', code: 'INVALID_FORMAT', rule: 'INVALID_JSON' },
    })
  }

  try {
    const payload = parseAdminAccessoryWriteRequest(body)
    const result = await saveAdminAccessoryProduct(payload, null)
    return NextResponse.json({ data: result }, { status: 201 })
  } catch (error) {
    if (error instanceof AdminAccessoryWriteValidationError) {
      return adminAccessoryValidationResponse(error)
    }
    if (error instanceof AdminAccessoryPersistenceError) {
      return adminAccessoryPersistenceResponse(error)
    }
    return adminAccessoryErrorResponse(500, 'INTERNAL_ERROR', 'Không thể tạo sản phẩm phụ kiện.')
  }
}
