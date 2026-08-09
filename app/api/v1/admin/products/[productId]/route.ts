import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'

import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { deleteRedisKey, deleteRedisKeysByPrefix } from '@/lib/redis'
import {
  ACCESSORY_CATALOG_SUMMARY_CACHE_KEY,
  ACCESSORY_PRODUCT_CACHE_PREFIX,
  PRODUCT_SEARCH_CACHE_PREFIX,
} from '@/lib/cache-keys'
import {
  AdminAccessoryPersistenceError,
  loadAdminAccessoryProduct,
  saveAdminAccessoryProduct,
} from '@/lib/catalog/admin-accessory-server'
import {
  AdminAccessoryWriteValidationError,
  parseAdminAccessoryWriteRequest,
} from '@/lib/catalog/admin-accessory-write'
import {
  adminAccessoryErrorResponse,
  adminAccessoryPersistenceResponse,
  adminAccessoryValidationResponse,
} from '@/lib/catalog/admin-accessory-api'

type Context = { params: Promise<{ productId: string }> }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function authorizationError(error: unknown) {
  if (error instanceof ApiAuthError) return authErrorResponse(error)
  throw error
}

async function authorizedProductId(request: Request, context: Context) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    return { ok: false as const, response: authorizationError(error) }
  }
  const { productId } = await context.params
  if (!UUID_PATTERN.test(productId)) {
    return {
      ok: false as const,
      response: adminAccessoryErrorResponse(400, 'VALIDATION_FAILED', 'Mã sản phẩm không hợp lệ.', {
        field: { path: 'productId', code: 'INVALID_FORMAT', rule: 'PRODUCT_ID_INVALID' },
      }),
    }
  }
  return { ok: true as const, productId }
}

export async function GET(request: Request, context: Context) {
  const resolved = await authorizedProductId(request, context)
  if (!resolved.ok) return resolved.response

  try {
    const data = await loadAdminAccessoryProduct(resolved.productId)
    return NextResponse.json({ data })
  } catch (error) {
    if (error instanceof AdminAccessoryPersistenceError) return adminAccessoryPersistenceResponse(error)
    return adminAccessoryErrorResponse(500, 'INTERNAL_ERROR', 'Không thể tải sản phẩm phụ kiện.')
  }
}

export async function PATCH(request: Request, context: Context) {
  const resolved = await authorizedProductId(request, context)
  if (!resolved.ok) return resolved.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return adminAccessoryErrorResponse(400, 'VALIDATION_FAILED', 'Nội dung JSON không hợp lệ.', {
      field: { path: 'body', code: 'INVALID_FORMAT', rule: 'INVALID_JSON' },
    })
  }

  try {
    const payload = parseAdminAccessoryWriteRequest(body, { requireExpectedUpdatedAt: true })
    const data = await saveAdminAccessoryProduct(payload, resolved.productId)
    return NextResponse.json({ data })
  } catch (error) {
    if (error instanceof AdminAccessoryWriteValidationError) {
      return adminAccessoryValidationResponse(error)
    }
    if (error instanceof AdminAccessoryPersistenceError) return adminAccessoryPersistenceResponse(error)
    return adminAccessoryErrorResponse(500, 'INTERNAL_ERROR', 'Không thể cập nhật sản phẩm phụ kiện.')
  }
}

export async function DELETE(request: Request, context: Context) {
  const resolved = await authorizedProductId(request, context)
  if (!resolved.ok) return resolved.response

  const supabase = getSupabaseAdmin()

  // 1. Get variant IDs to delete child records first
  const { data: variants } = await supabase
    .from('product_variants')
    .select('id')
    .eq('product_id', resolved.productId)

  const variantIds = variants?.map((v) => v.id) || []

  // 2. Clean up child records in related tables
  if (variantIds.length > 0) {
    await supabase.from('inventory_items').delete().in('variant_id', variantIds)
    await supabase.from('cart_items').delete().in('variant_id', variantIds)
    await supabase.from('product_media').delete().in('variant_id', variantIds)
  }

  await supabase.from('product_media').delete().eq('product_id', resolved.productId)
  await supabase.from('product_service_label_assignments').delete().eq('product_id', resolved.productId)
  await supabase.from('product_collection_memberships').delete().eq('product_id', resolved.productId)
  await supabase.from('product_variants').delete().eq('product_id', resolved.productId)

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', resolved.productId)

  if (error) {
    return adminAccessoryErrorResponse(500, 'INTERNAL_ERROR', `Không thể xóa sản phẩm phụ kiện: ${error.message}`)
  }

  revalidateTag('accessory-catalog')
  await Promise.all([
    deleteRedisKey(ACCESSORY_CATALOG_SUMMARY_CACHE_KEY),
    deleteRedisKeysByPrefix(ACCESSORY_PRODUCT_CACHE_PREFIX),
    deleteRedisKeysByPrefix(PRODUCT_SEARCH_CACHE_PREFIX),
  ])

  return NextResponse.json({ success: true })
}
