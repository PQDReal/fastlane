import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'

import { authorizeAdminInventoryRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import {
  ACCESSORY_CATALOG_SUMMARY_CACHE_KEY,
  ACCESSORY_PRODUCT_CACHE_PREFIX,
  CAR_CATALOG_CACHE_PREFIX,
  CAR_DETAIL_CACHE_PREFIX,
  DEPOSIT_VEHICLE_METADATA_CACHE_PREFIX,
  MOTORBIKE_CATALOG_CACHE_KEY,
  MOTORBIKE_DETAIL_CACHE_PREFIX,
  PRODUCT_SEARCH_CACHE_PREFIX,
} from '@/lib/cache-keys'
import { deleteRedisKey, deleteRedisKeysByPrefix } from '@/lib/redis'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type Context = { params: Promise<{ variantId: string }> }
async function invalidateInventoryCatalogCaches() {
  revalidateTag('accessory-catalog')
  revalidateTag('car-catalog')
  revalidateTag('motorbike-catalog')
  revalidateTag('vehicle-catalog')

  await Promise.all([
    deleteRedisKey(ACCESSORY_CATALOG_SUMMARY_CACHE_KEY),
    deleteRedisKeysByPrefix(ACCESSORY_PRODUCT_CACHE_PREFIX),
    deleteRedisKeysByPrefix(CAR_CATALOG_CACHE_PREFIX),
    deleteRedisKeysByPrefix(CAR_DETAIL_CACHE_PREFIX),
    deleteRedisKeysByPrefix(DEPOSIT_VEHICLE_METADATA_CACHE_PREFIX),
    deleteRedisKey(MOTORBIKE_CATALOG_CACHE_KEY),
    deleteRedisKeysByPrefix(MOTORBIKE_DETAIL_CACHE_PREFIX),
    deleteRedisKeysByPrefix(PRODUCT_SEARCH_CACHE_PREFIX),
  ])
}

export async function PUT(request: Request, context: Context) {
  try {
    await authorizeAdminInventoryRequest(request)
  } catch (error) {
    if (error instanceof ApiAuthError) return authErrorResponse(error)
    throw error
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'D\u1eef li\u1ec7u g\u1eedi l\u00ean kh\u00f4ng h\u1ee3p l\u1ec7.' }, { status: 400 })
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'D\u1eef li\u1ec7u g\u1eedi l\u00ean kh\u00f4ng h\u1ee3p l\u1ec7.' }, { status: 400 })
  }

  const payload = body as { availableQuantity?: unknown; expectedUpdatedAt?: unknown; isActive?: unknown }
  const quantity = payload.availableQuantity
  const expectedUpdatedAt = payload.expectedUpdatedAt
  const isActive = payload.isActive

  if (!Number.isInteger(quantity) || (quantity as number) < 0 || (quantity as number) > 1_000_000) {
    return NextResponse.json({ error: 'S\u1ed1 l\u01b0\u1ee3ng t\u1ed3n ph\u1ea3i l\u00e0 s\u1ed1 nguy\u00ean t\u1eeb 0 \u0111\u1ebfn 1.000.000.' }, { status: 400 })
  }
  if (expectedUpdatedAt !== null && typeof expectedUpdatedAt !== 'string') {
    return NextResponse.json({ error: 'Phi\u00ean b\u1ea3n d\u1eef li\u1ec7u t\u1ed3n kho kh\u00f4ng h\u1ee3p l\u1ec7.' }, { status: 400 })
  }

  if (typeof isActive !== 'boolean') {
    return NextResponse.json({ error: 'Trạng thái kinh doanh không hợp lệ.' }, { status: 400 })
  }

  const { variantId } = await context.params
  const supabase = getSupabaseAdmin()
  const { data: variant, error: variantError } = await supabase.from('product_variants').select('id,is_active').eq('id', variantId).maybeSingle()
  if (variantError) return NextResponse.json({ error: variantError.message }, { status: 500 })
  if (!variant) return NextResponse.json({ error: 'Kh\u00f4ng t\u00ecm th\u1ea5y phi\u00ean b\u1ea3n s\u1ea3n ph\u1ea9m.' }, { status: 404 })

  async function responseWithStatus(data: { variant_id: string; on_hand_quantity: number; updated_at: string }) {
    const { error: statusError } = await supabase.from('product_variants').update({ is_active: isActive }).eq('id', variantId)
    if (statusError) return NextResponse.json({ error: statusError.message }, { status: 400 })
    await invalidateInventoryCatalogCaches()
    return NextResponse.json({ variantId: data.variant_id, onHandQuantity: data.on_hand_quantity, updatedAt: data.updated_at, variantIsActive: isActive })
  }
  const { data: current, error: currentError } = await supabase
    .from('inventory_items')
    .select('variant_id,on_hand_quantity,updated_at')
    .eq('variant_id', variantId)
    .maybeSingle()

  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 })
  if ((current?.updated_at ?? null) !== expectedUpdatedAt) {
    return NextResponse.json({ error: 'T\u1ed3n kho \u0111\u00e3 thay \u0111\u1ed5i. Vui l\u00f2ng t\u1ea3i l\u1ea1i d\u1eef li\u1ec7u.' }, { status: 409 })
  }

  const updatedAt = new Date().toISOString()
  if (!current) {
    const { data, error } = await supabase
      .from('inventory_items')
      .insert({ variant_id: variantId, on_hand_quantity: quantity, updated_at: updatedAt })
      .select('variant_id,on_hand_quantity,updated_at')
      .single()

    if (error) {
      const status = error.code === '23505' ? 409 : 400
      return NextResponse.json({ error: status === 409 ? 'T\u1ed3n kho \u0111\u00e3 thay \u0111\u1ed5i. Vui l\u00f2ng th\u1eed l\u1ea1i.' : error.message }, { status })
    }
    return responseWithStatus(data)
  }

  const { data, error } = await supabase
    .from('inventory_items')
    .update({ on_hand_quantity: quantity, updated_at: updatedAt })
    .eq('variant_id', variantId)
    .eq('updated_at', expectedUpdatedAt as string)
    .select('variant_id,on_hand_quantity,updated_at')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'T\u1ed3n kho \u0111\u00e3 thay \u0111\u1ed5i. Vui l\u00f2ng t\u1ea3i l\u1ea1i d\u1eef li\u1ec7u.' }, { status: 409 })
  return responseWithStatus(data)
}
