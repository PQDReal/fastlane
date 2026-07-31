import { NextResponse } from 'next/server'

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

function handleAuthorizationError(error: unknown) {
  if (error instanceof ApiAuthError) return authErrorResponse(error)
  throw error
}

export async function GET(request: Request) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    return handleAuthorizationError(error)
  }

  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')
  const categoryId = searchParams.get('categoryId')
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') ?? '10', 10) || 10))
  const from = (page - 1) * limit
  const supabase = getSupabaseAdmin()

  let dbQuery = supabase
    .from('products')
    .select(`
      *,
      categories (
        name
      ),
      service_label_assignments:product_service_label_assignments (
        service_label_id
      ),
      variants:product_variants (
        sku,
        is_active
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

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const total = count ?? 0
  return NextResponse.json({
    data: (data ?? []).map((item) => {
      const activeVariant = Array.isArray(item.variants)
        ? item.variants.find((variant: { is_active?: boolean }) => variant.is_active === true) ?? item.variants[0]
        : null
      return {
        ...item,
        category: item.categories?.name || 'Chưa phân loại',
        sku: activeVariant?.sku,
      }
    }),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  })
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
