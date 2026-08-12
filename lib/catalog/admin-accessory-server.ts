import 'server-only'

import { revalidateTag } from 'next/cache'
import {
  ACCESSORY_CATALOG_SUMMARY_CACHE_KEY,
  ACCESSORY_PRODUCT_CACHE_PREFIX,
  PRODUCT_SEARCH_CACHE_PREFIX,
} from '@/lib/cache-keys'
import { mapAdminAccessoryEditorRow } from '@/lib/catalog/admin-accessory-editor'
import {
  adminAccessoryRpcPayload,
  type AdminAccessoryEditorData,
  type AdminAccessorySaveResult,
  type AdminAccessoryWriteRequest,
} from '@/lib/catalog/admin-accessory-write'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { deleteRedisKey, deleteRedisKeysByPrefix } from '@/lib/redis'

export const ADMIN_ACCESSORY_PRODUCT_SELECT = `
  id,
  category_id,
  name,
  slug,
  description,
  specifications,
  image_urls,
  is_active,
  product_type,
  accessory_template_code,
  accessory_template_version,
  updated_at,
  service_label_assignments:product_service_label_assignments(
    service_label_id,
    service_label:catalog_service_labels(is_active)
  ),
  collection_memberships:product_collection_memberships(
    id,
    source_system,
    is_primary,
    is_active,
    metadata,
    collection:catalog_collections(
      id,
      parent_id,
      kind,
      slug,
      name,
      display_order,
      is_active
    )
  ),
  option_groups:product_option_groups(
    id,
    code,
    name,
    display_type,
    minimum_selections,
    maximum_selections,
    display_order,
    is_active,
    metadata,
    option_values:product_option_values(
      id,
      code,
      name,
      swatch_url,
      color_hex,
      display_order,
      is_active
    )
  ),
  variants:product_variants(
    id,
    sku,
    name,
    original_price,
    sale_price,
    is_active,
    created_at,
    inventory:inventory_items(on_hand_quantity),
    option_mappings:product_variant_option_values(option_group_id,option_value_id)
  ),
  media:product_media(
    id,
    variant_id,
    option_value_id,
    url,
    display_order,
    is_active
  )
`

export class AdminAccessoryPersistenceError extends Error {
  constructor(
    readonly status: 404 | 409 | 422 | 500 | 503,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AdminAccessoryPersistenceError'
  }
}

function rpcError(error: { code?: string; message?: string }) {
  if (error.code === 'PGRST202' || error.message?.includes('save_admin_accessory_product_v3')) {
    return new AdminAccessoryPersistenceError(
      503,
      'CATALOG_WRITE_MIGRATION_REQUIRED',
      'Backend ghi phụ kiện chưa được cài đặt trên cơ sở dữ liệu.',
    )
  }
  if (error.code === 'P0002') {
    return new AdminAccessoryPersistenceError(404, 'PRODUCT_NOT_FOUND', 'Không tìm thấy phụ kiện cần cập nhật.')
  }
  if (error.code === '40001') {
    return new AdminAccessoryPersistenceError(
      409,
      'PRODUCT_VERSION_CONFLICT',
      'Sản phẩm đã được người khác cập nhật. Hãy tải lại trước khi lưu.',
    )
  }
  if (error.code === '23505') {
    return new AdminAccessoryPersistenceError(409, 'CATALOG_IDENTITY_CONFLICT', 'Slug hoặc SKU đã được sử dụng.')
  }
  if (error.code === '22P02' || error.code === '22003' || error.code === '22023' || error.code === '23514' || error.code === '23503') {
    return new AdminAccessoryPersistenceError(
      422,
      'CATALOG_RULE_VIOLATION',
      error.message || 'Dữ liệu phụ kiện không đáp ứng quy tắc danh mục.',
    )
  }
  return new AdminAccessoryPersistenceError(500, 'CATALOG_WRITE_FAILED', 'Không thể lưu sản phẩm phụ kiện.')
}

function saveResult(value: unknown): AdminAccessorySaveResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AdminAccessoryPersistenceError(500, 'CATALOG_WRITE_RESULT_INVALID', 'Kết quả ghi sản phẩm không hợp lệ.')
  }
  const row = value as Record<string, unknown>
  if (
    typeof row.id !== 'string'
    || typeof row.updatedAt !== 'string'
    || typeof row.isActive !== 'boolean'
  ) {
    throw new AdminAccessoryPersistenceError(500, 'CATALOG_WRITE_RESULT_INVALID', 'Kết quả ghi sản phẩm không hợp lệ.')
  }
  return {
    id: row.id,
    productType: 'ACCESSORY',
    isActive: row.isActive,
    updatedAt: row.updatedAt,
  }
}

export async function saveAdminAccessoryProduct(
  request: AdminAccessoryWriteRequest,
  productId: string | null,
): Promise<AdminAccessorySaveResult> {
  const { data, error } = await getSupabaseAdmin().rpc('save_admin_accessory_product_v3', {
    target_product_id: productId,
    expected_updated_at: request.expectedUpdatedAt ?? null,
    target_payload: adminAccessoryRpcPayload(request),
  })
  if (error) throw rpcError(error)
  const result = saveResult(data)

  const supabase = getSupabaseAdmin()
  const { data: persistedVariants, error: variantReadError } = await supabase
    .from('product_variants')
    .select('id,name,created_at')
    .eq('product_id', result.id)
    .order('created_at', { ascending: true })
  if (variantReadError) {
    throw new AdminAccessoryPersistenceError(500, 'INVENTORY_VARIANTS_READ_FAILED', 'Đã lưu phụ kiện nhưng không thể xác định các SKU để tạo tồn kho.')
  }
  if ((persistedVariants ?? []).length < request.variants.length) {
    if (!productId) await supabase.from('products').delete().eq('id', result.id)
    throw new AdminAccessoryPersistenceError(500, 'INVENTORY_VARIANT_MAPPING_FAILED', 'Số SKU đã lưu không khớp dữ liệu tồn kho ban đầu.')
  }

  const unused = [...(persistedVariants ?? [])]
  const inventoryRows = request.variants.map((variant) => {
    let index = variant.existingId
      ? unused.findIndex((row) => row.id === variant.existingId)
      : unused.findIndex((row) => row.name === variant.name)
    if (index < 0) index = 0
    const [persisted] = index >= 0 ? unused.splice(index, 1) : []
    if (!persisted) {
      throw new AdminAccessoryPersistenceError(500, 'INVENTORY_VARIANT_MAPPING_FAILED', `Không thể ánh xạ tồn kho cho biến thể ${variant.name}.`)
    }
    return {
      variant_id: persisted.id,
      on_hand_quantity: variant.stockQuantity,
      updated_at: new Date().toISOString(),
    }
  })
  const { error: inventoryError } = await supabase
    .from('inventory_items')
    .upsert(inventoryRows, { onConflict: 'variant_id' })
  if (inventoryError) {
    if (!productId) await supabase.from('products').delete().eq('id', result.id)
    throw new AdminAccessoryPersistenceError(500, 'INVENTORY_WRITE_FAILED', `Không thể lưu tồn kho ban đầu: ${inventoryError.message}`)
  }
  revalidateTag('accessory-catalog')
  await Promise.all([
    deleteRedisKey(ACCESSORY_CATALOG_SUMMARY_CACHE_KEY),
    deleteRedisKeysByPrefix(ACCESSORY_PRODUCT_CACHE_PREFIX),
    deleteRedisKeysByPrefix(PRODUCT_SEARCH_CACHE_PREFIX),
  ])
  return result
}

export async function loadAdminAccessoryProduct(productId: string): Promise<AdminAccessoryEditorData> {
  const { data, error } = await getSupabaseAdmin()
    .from('products')
    .select(ADMIN_ACCESSORY_PRODUCT_SELECT)
    .eq('id', productId)
    .eq('product_type', 'ACCESSORY')
    .maybeSingle()

  if (error) {
    throw new AdminAccessoryPersistenceError(500, 'CATALOG_READ_FAILED', 'Không thể tải dữ liệu phụ kiện.')
  }
  if (!data) {
    throw new AdminAccessoryPersistenceError(404, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm phụ kiện.')
  }
  return mapAdminAccessoryEditorRow(data)
}
