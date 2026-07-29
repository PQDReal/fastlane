import 'server-only'

import { mapCatalogProduct } from '@/lib/catalog/mapper'
import type {
  AccessoryCatalogPage,
  CatalogProduct,
  CatalogVariantContext,
} from '@/lib/catalog/types'
import {
  matchingProductIdsForLabels,
  type CatalogServiceLabel,
} from '@/lib/catalog/service-labels'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const CATALOG_PRODUCT_SELECT = `
  id,
  category_id,
  name,
  slug,
  description,
  product_type,
  displayed_price,
  image_urls,
  specifications,
  service_label_assignments:product_service_label_assignments(
    service_label_id,
    service_label:catalog_service_labels!inner(
      id,
      code,
      name,
      description,
      display_order,
      is_active
    )
  ),
  category:categories!inner(id,name,slug),
  collection_memberships:product_collection_memberships(
    id,
    source_system,
    is_primary,
    first_seen_at,
    last_seen_at,
    is_active,
    metadata,
    collection:catalog_collections!inner(
      id,
      parent_id,
      kind,
      source_system,
      source_key,
      slug,
      name,
      vehicle_filter_mode,
      display_order,
      is_active,
      metadata,
      vehicle_model:vehicle_models(
        id,
        code,
        slug,
        name,
        vehicle_kind,
        is_active,
        metadata
      )
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
      price_adjustment,
      display_order,
      is_active,
      metadata
    )
  ),
  variants:product_variants!inner(
    id,
    product_id,
    sku,
    name,
    original_price,
    sale_price,
    deposit_amount,
    option_signature,
    is_active,
    metadata,
    inventory:inventory_items(on_hand_quantity),
    option_mappings:product_variant_option_values(option_group_id,option_value_id)
  ),
  media:product_media(
    id,
    product_id,
    variant_id,
    option_value_id,
    role,
    media_type,
    url,
    alt_text,
    display_order,
    is_active,
    metadata
  )
`

function accessoryProductsQuery() {
  return getSupabaseAdmin()
    .from('products')
    .select(CATALOG_PRODUCT_SELECT)
    .eq('is_active', true)
    .eq('product_type', 'ACCESSORY')
    .eq('variants.is_active', true)
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback
}

async function listActiveServiceLabels(): Promise<CatalogServiceLabel[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('catalog_service_labels')
    .select('id,code,name,description,display_order,is_active')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw new Error(`Unable to list accessory service labels: ${error.message}`)
  return (data ?? []).map((row) => ({
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    description: typeof row.description === 'string' ? row.description : null,
    displayOrder: Number(row.display_order) || 0,
    isActive: row.is_active === true,
    assignmentCount: 0,
  }))
}

async function productIdsMatchingServiceCodes(codes: string[]): Promise<string[] | null> {
  const selectedCodes = [...new Set(codes.map((code) => code.trim()).filter(Boolean))].slice(0, 20)
  if (selectedCodes.length === 0) return null

  const supabase = getSupabaseAdmin()
  const { data: labels, error: labelsError } = await supabase
    .from('catalog_service_labels')
    .select('id,code')
    .in('code', selectedCodes)
    .eq('is_active', true)

  if (labelsError) throw new Error(`Unable to resolve accessory service labels: ${labelsError.message}`)
  if ((labels ?? []).length !== selectedCodes.length) return []

  const labelIds = (labels ?? []).map((label) => String(label.id))
  const { data: assignments, error: assignmentsError } = await supabase
    .from('product_service_label_assignments')
    .select('product_id,service_label_id,product:products!inner(id,is_active,product_type)')
    .in('service_label_id', labelIds)
    .eq('product.is_active', true)
    .eq('product.product_type', 'ACCESSORY')

  if (assignmentsError) throw new Error(`Unable to filter accessory service labels: ${assignmentsError.message}`)
  return matchingProductIdsForLabels(
    (assignments ?? []).map((assignment) => ({
      productId: String(assignment.product_id),
      serviceLabelId: String(assignment.service_label_id),
    })),
    labelIds,
  )
}

export async function listAccessoryCatalog(options: {
  page?: number
  pageSize?: number
  categorySlug?: string
  serviceCodes?: string[]
} = {}): Promise<AccessoryCatalogPage> {
  const page = positiveInteger(options.page, 1)
  const pageSize = Math.min(100, positiveInteger(options.pageSize, 12))
  const [serviceLabels, matchingProductIds] = await Promise.all([
    listActiveServiceLabels(),
    productIdsMatchingServiceCodes(options.serviceCodes ?? []),
  ])

  if (matchingProductIds?.length === 0) {
    return { products: [], serviceLabels, page: 1, pageSize, total: 0, totalPages: 1 }
  }

  const start = (page - 1) * pageSize
  let query = getSupabaseAdmin()
    .from('products')
    .select(CATALOG_PRODUCT_SELECT, { count: 'exact' })
    .eq('is_active', true)
    .eq('product_type', 'ACCESSORY')
    .eq('variants.is_active', true)

  if (options.categorySlug) query = query.eq('category.slug', options.categorySlug)
  if (matchingProductIds) query = query.in('id', matchingProductIds)
  const { data, count, error } = await query
    .order('name', { ascending: true })
    .range(start, start + pageSize - 1)

  if (error) throw new Error(`Unable to list accessory catalog: ${error.message}`)
  const total = count ?? 0
  return {
    products: (data ?? []).map(mapCatalogProduct),
    serviceLabels,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export async function getAccessoryCatalogProductBySlug(
  slug: string,
): Promise<CatalogProduct | null> {
  const { data, error } = await accessoryProductsQuery()
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw new Error(`Unable to read accessory catalog product: ${error.message}`)
  return data ? mapCatalogProduct(data) : null
}

/**
 * Loads all requested variants and their product/options/media in one query.
 * Results are returned in caller order and unknown/inactive IDs are omitted.
 */
export async function getAccessoryCatalogVariantsByIds(
  variantIds: string[],
): Promise<CatalogVariantContext[]> {
  const uniqueIds = [...new Set(variantIds.filter((id) => id.trim().length > 0))]
  if (uniqueIds.length === 0) return []

  const { data, error } = await accessoryProductsQuery().in('variants.id', uniqueIds)
  if (error) throw new Error(`Unable to read accessory catalog variants: ${error.message}`)

  const byId = new Map<string, CatalogVariantContext>()
  for (const row of data ?? []) {
    const product = mapCatalogProduct(row)
    for (const variant of product.variants) {
      if (uniqueIds.includes(variant.id)) byId.set(variant.id, { product, variant })
    }
  }
  return uniqueIds.flatMap((id) => {
    const context = byId.get(id)
    return context ? [context] : []
  })
}

export async function getAccessoryCatalogVariantById(
  variantId: string,
): Promise<CatalogVariantContext | null> {
  return (await getAccessoryCatalogVariantsByIds([variantId]))[0] ?? null
}
