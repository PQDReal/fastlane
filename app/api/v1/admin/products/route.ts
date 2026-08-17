import { NextResponse } from 'next/server'

import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { toNamePrefixTsQuery } from '@/lib/catalog/search'
import { isAdminSellableVehicleVariant } from '@/lib/admin-inventory'
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
        id,
        sku,
        is_active,
        inventory_items (on_hand_quantity)
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

  const productRows = data ?? []
  const vehicleProductIds = productRows
    .filter((item) => item.product_type === 'CAR' || item.product_type === 'BIKE')
    .map((item) => item.id)
  const validVehicleVariantIdsByProduct = new Map<string, Set<string>>()

  if (vehicleProductIds.length > 0) {
    const { data: vehicleRows, error: vehicleError } = await supabase
      .from('vehicle_variants')
      .select('product_id,product_variant_id,product_type,sku,variant_name,version,color')
      .in('product_id', vehicleProductIds)

    if (vehicleError) {
      return NextResponse.json({ error: vehicleError.message }, { status: 500 })
    }

    for (const row of vehicleRows ?? []) {
      if (!row.product_id || !isAdminSellableVehicleVariant(row)) continue
      const variantIds = validVehicleVariantIdsByProduct.get(String(row.product_id)) ?? new Set<string>()
      variantIds.add(String(row.product_variant_id))
      validVehicleVariantIdsByProduct.set(String(row.product_id), variantIds)
    }
  }

  const total = count ?? 0
  return NextResponse.json({
    data: productRows.map((item) => {
      const isVehicle = item.product_type === 'CAR' || item.product_type === 'BIKE'
      const variants = Array.isArray(item.variants)
        ? (isVehicle
          ? item.variants.filter((variant: { id?: string }) => validVehicleVariantIdsByProduct.get(String(item.id))?.has(String(variant.id)))
          : item.variants)
        : []
      const activeVariant = variants.find((variant: { is_active?: boolean }) => variant.is_active === true) ?? variants[0] ?? null
      const inventoryQuantity = variants.reduce((total: number, variant: { inventory_items?: { on_hand_quantity?: number } | { on_hand_quantity?: number }[] | null }) => {
            const inventory = Array.isArray(variant.inventory_items) ? variant.inventory_items[0] : variant.inventory_items
            return total + Math.max(0, Number(inventory?.on_hand_quantity ?? 0) || 0)
          }, 0)
      const inventoryVariantCount = variants.length
      return {
        ...item,
        category: item.categories?.name || 'Chưa phân loại',
        sku: activeVariant?.sku,
        inventory_quantity: inventoryQuantity,
        inventory_variant_count: inventoryVariantCount,
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
