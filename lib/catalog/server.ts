import 'server-only'

import { unstable_cache } from 'next/cache'
import { mapCatalogProduct } from '@/lib/catalog/mapper'
import {
  buildAccessoryFacets,
  filterAccessoryProducts,
  type AccessoryVehicleContext,
} from '@/lib/catalog/accessory-filters'
import type {
  AccessoryCatalogFilters,
  AccessoryCatalogPage,
  CatalogProduct,
  CatalogVariantContext,
} from '@/lib/catalog/types'
import type { CatalogServiceLabel } from '@/lib/catalog/service-labels'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  ACCESSORY_CATALOG_SUMMARY_CACHE_KEY,
  ACCESSORY_VEHICLE_CONTEXT_CACHE_KEY,
  accessoryProductCacheKey,
} from '@/lib/cache-keys'
import { readRedisJson, writeRedisJson } from '@/lib/redis'

const CATALOG_PRODUCT_SELECT = `
  id,
  category_id,
  name,
  slug,
  description,
  product_type,
  displayed_price,
  deposit_price,
  created_at,
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

// The first pass intentionally omits option values, mappings and media. It keeps
// search/facet requests small, then the second pass hydrates only the current page.
const ACCESSORY_CATALOG_SUMMARY_SELECT = `
  id,
  category_id,
  name,
  slug,
  description,
  product_type,
  displayed_price,
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
    inventory:inventory_items(on_hand_quantity)
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

async function loadActiveServiceLabels(): Promise<CatalogServiceLabel[]> {
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

const loadNextCachedAccessoryVehicleContext = unstable_cache(
  async () => {
    const { data, error } = await getSupabaseAdmin()
      .from('catalog_collections')
      .select('id,parent_id,slug,name,display_order,vehicle_model:vehicle_models(code,is_active)')
      .eq('kind', 'MODEL')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true })
    if (error) throw new Error(`Unable to list accessory vehicle context: ${error.message}`)
    return (data ?? []).flatMap((row) => {
      const vehicleModel = Array.isArray(row.vehicle_model) ? row.vehicle_model[0] : row.vehicle_model
      if (!vehicleModel || vehicleModel.is_active === false) return []
      return [{
        id: String(row.id),
        parentId: row.parent_id === null ? null : String(row.parent_id),
        slug: String(row.slug),
        name: String(row.name),
        code: String(vehicleModel.code ?? row.slug),
        displayOrder: Number(row.display_order) || 0,
      }]
    })
  },
  ['accessory-vehicle-context-v2'],
  {
    revalidate: 300,
    tags: ['accessory-catalog'],
  },
)

export async function listAccessoryVehicleContext(): Promise<AccessoryVehicleContext[]> {
  const cached = await readRedisJson<AccessoryVehicleContext[]>(
    ACCESSORY_VEHICLE_CONTEXT_CACHE_KEY,
  )
  if (cached) return cached

  const context = await loadNextCachedAccessoryVehicleContext()
  await writeRedisJson(ACCESSORY_VEHICLE_CONTEXT_CACHE_KEY, context, 300)
  return context
}

const loadNextCachedAccessoryCatalogSummary = unstable_cache(
  async () => {
    const [serviceLabels, catalogResult] = await Promise.all([
      loadActiveServiceLabels(),
      getSupabaseAdmin()
        .from('products')
        .select(ACCESSORY_CATALOG_SUMMARY_SELECT)
        .eq('is_active', true)
        .eq('product_type', 'ACCESSORY')
        .eq('variants.is_active', true)
        .order('name', { ascending: true }),
    ])

    if (catalogResult.error) {
      throw new Error(`Unable to list accessory catalog: ${catalogResult.error.message}`)
    }

    return {
      serviceLabels,
      products: (catalogResult.data ?? []).map(mapCatalogProduct),
    }
  },
  ['accessory-catalog-summary-v2'],
  {
    revalidate: 300,
    tags: ['accessory-catalog'],
  },
)

type AccessoryCatalogSummary = Awaited<
  ReturnType<typeof loadNextCachedAccessoryCatalogSummary>
>

async function loadAccessoryCatalogSummary(): Promise<AccessoryCatalogSummary> {
  const cached = await readRedisJson<AccessoryCatalogSummary>(
    ACCESSORY_CATALOG_SUMMARY_CACHE_KEY,
  )
  if (cached) return cached

  const summary = await loadNextCachedAccessoryCatalogSummary()
  await writeRedisJson(ACCESSORY_CATALOG_SUMMARY_CACHE_KEY, summary, 300)
  return summary
}

async function loadAccessoryProductsByIds(ids: string[]): Promise<CatalogProduct[]> {
  const uniqueIds = [...new Set(ids)].sort()
  if (uniqueIds.length === 0) return []

  return unstable_cache(
    async () => {
      const { data, error } = await accessoryProductsQuery().in('id', uniqueIds)
      if (error) {
        throw new Error(`Unable to hydrate accessory catalog: ${error.message}`)
      }
      return (data ?? []).map(mapCatalogProduct)
    },
    ['accessory-catalog-products-v2', ...uniqueIds],
    {
      revalidate: 300,
      tags: ['accessory-catalog'],
    },
  )()
}

export async function listAccessoryCatalog(options: {
  page?: number
  pageSize?: number
  categorySlug?: string
  filters?: AccessoryCatalogFilters
} = {}): Promise<AccessoryCatalogPage> {
  const page = positiveInteger(options.page, 1)
  const pageSize = Math.min(100, positiveInteger(options.pageSize, 12))
  const [summary, vehicleContext] = await Promise.all([
    loadAccessoryCatalogSummary(),
    listAccessoryVehicleContext(),
  ])
  const categoryProducts = options.categorySlug
    ? summary.products.filter((product) => product.category?.slug === options.categorySlug)
    : summary.products
  const products = options.filters
    ? filterAccessoryProducts(categoryProducts, options.filters, vehicleContext)
    : categoryProducts
  const total = products.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)
  const start = (currentPage - 1) * pageSize
  const pageIds = products
    .slice(start, start + pageSize)
    .map((product) => product.id)
  let pageProducts: CatalogProduct[] = []

  if (pageIds.length > 0) {
    const pageData = await loadAccessoryProductsByIds(pageIds)
    const byId = new Map(
      pageData.map((product) => [product.id, product] as const),
    )
    pageProducts = pageIds.flatMap((id) => {
      const product = byId.get(id)
      return product ? [product] : []
    })
  }

  return {
    products: pageProducts,
    serviceLabels: summary.serviceLabels,
    page: currentPage,
    pageSize,
    total,
    totalPages,
    facets: buildAccessoryFacets(categoryProducts, vehicleContext),
  }
}

export async function getAccessoryCatalogProductBySlug(
  slug: string,
): Promise<CatalogProduct | null> {
  const cacheKey = accessoryProductCacheKey(slug)
  const cached = await readRedisJson<CatalogProduct>(cacheKey)
  if (cached) return cached

  const product = await unstable_cache(
    async () => {
      const { data, error } = await accessoryProductsQuery()
        .eq('slug', slug)
        .maybeSingle()

      if (error) throw new Error(`Unable to read accessory catalog product: ${error.message}`)
      return data ? mapCatalogProduct(data) : null
    },
    ['accessory-catalog-product-v2', slug],
    {
      revalidate: 300,
      tags: ['accessory-catalog', `accessory:${slug}`],
    },
  )()
  if (product) await writeRedisJson(cacheKey, product, 300)
  return product
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
