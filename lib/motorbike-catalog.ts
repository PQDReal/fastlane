import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { MOTORBIKE_CATALOG_CACHE_KEY, motorbikeDetailCacheKey } from '@/lib/cache-keys'
import { readRedisJson, writeRedisJson } from '@/lib/redis'

type JsonRecord = Record<string, unknown>

export type MotorbikeCatalogColor = {
  name: string
  imageUrl: string
  swatchUrl: string
  order: number
}

export type MotorbikeCatalogVersion = {
  id: string
  name: string
  sku: string
  price: number
  depositAmount: number
  order: number
}

export type MotorbikeCatalogVariantRow = {
  id: string
  version: string
  color: string
  sku: string
  price: number
  depositAmount: number
}

export type MotorbikeCatalogItem = {
  productId: string
  name: string
  slug: string
  description: string
  listingImageUrl: string
  heroImageUrl: string
  detailImageUrls: string[]
  brochureUrl: string
  specifications: JsonRecord
  displayedPrice: number
  colors: MotorbikeCatalogColor[]
  versions: MotorbikeCatalogVersion[]
  variantRows: MotorbikeCatalogVariantRow[]
}

type VehicleVariantRow = {
  id: string
  product_id: string
  product_name: string
  deposit_amount: number | string
  specs: unknown
  variant_name: string
  sku: string
  price: number | string
  color: string
  image_car_url: string
  image_color_url: string
  version: string
  is_active: boolean
}

type MotorbikeCatalogReadRow = {
  product_id: string
  product_name: string
  shared_specs: unknown
  variants: Array<Omit<VehicleVariantRow, 'product_id' | 'product_name' | 'specs'>> | null
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function number(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function orderOf(row: VehicleVariantRow, key: 'version_order' | 'color_order') {
  return number(record(record(row.specs).catalog)[key])
}

function mapRows(rows: VehicleVariantRow[]): MotorbikeCatalogItem[] {
  const grouped = new Map<string, VehicleVariantRow[]>()
  for (const row of rows) {
    const group = grouped.get(row.product_id) ?? []
    group.push(row)
    grouped.set(row.product_id, group)
  }

  return [...grouped.values()].map((productRows) => {
    const first = productRows[0]
    const rootSpecs = record(first.specs)
    const catalog = record(rootSpecs.catalog)
    const technicalSpecifications = record(rootSpecs.specs)
    const specifications = Object.keys(technicalSpecifications).length > 0
      ? technicalSpecifications
      : Object.fromEntries(
          Object.entries(rootSpecs).filter(([key]) => key !== 'catalog'),
        )

    const colors = [...new Map(
      productRows.map((row) => [row.color, {
        name: row.color,
        imageUrl: row.image_car_url,
        swatchUrl: row.image_color_url,
        order: orderOf(row, 'color_order'),
      }]),
    ).values()].sort((left, right) => left.order - right.order)

    const versions = [...new Map(
      productRows.map((row) => [row.version, {
        id: row.id,
        name: row.version,
        sku: row.sku.replace(/-C\d{2}$/i, ''),
        price: number(row.price),
        depositAmount: number(row.deposit_amount),
        order: orderOf(row, 'version_order'),
      }]),
    ).values()].sort((left, right) => left.order - right.order)

    return {
      productId: first.product_id,
      name: first.product_name,
      slug: text(catalog.product_slug),
      description: text(catalog.description),
      listingImageUrl: text(catalog.listing_image_url),
      heroImageUrl: text(catalog.hero_image_url),
      detailImageUrls: Array.isArray(catalog.detail_image_urls)
        ? catalog.detail_image_urls.map(text).filter(Boolean)
        : [],
      brochureUrl: text(
        rootSpecs.brochure_url ??
        rootSpecs.brochureUrl ??
        rootSpecs.brochure,
      ),
      specifications,
      displayedPrice: Math.min(...versions.map((version) => version.price)),
      colors,
      versions,
      variantRows: productRows.map((row) => ({
        id: row.id,
        version: row.version,
        color: row.color,
        sku: row.sku,
        price: number(row.price),
        depositAmount: number(row.deposit_amount),
      })),
    }
  }).sort((left, right) => left.name.localeCompare(right.name, 'vi'))
}

async function loadMotorbikeCatalog(): Promise<MotorbikeCatalogItem[]> {
  const supabase = getSupabaseAdmin()
  const aggregate = await supabase.rpc('list_active_motorbike_catalog')

  if (!aggregate.error) {
    const rows = ((aggregate.data ?? []) as MotorbikeCatalogReadRow[]).flatMap((product) =>
      (product.variants ?? []).map((variant) => ({
        ...variant,
        product_id: product.product_id,
        product_name: product.product_name,
        specs: product.shared_specs,
      })),
    )
    return mapRows(rows)
  }

  const { data, error } = await supabase
    .from('vehicle_variants')
    .select('id,product_id,product_name,deposit_amount,specs,variant_name,sku,price,color,image_car_url,image_color_url,version,is_active')
    .eq('product_type', 'BIKE')
    .eq('is_active', true)

  if (error) {
    throw new Error(
      `Unable to load motorbike vehicle variants: ${error.message}; `
      + `catalog read model: ${aggregate.error.message}`,
    )
  }

  return mapRows((data ?? []) as VehicleVariantRow[])
}

const loadCachedMotorbikeCatalog = unstable_cache(
  loadMotorbikeCatalog,
  ['motorbike-catalog-v1'],
  {
    revalidate: 300,
    tags: ['motorbike-catalog'],
  },
)

async function loadDistributedMotorbikeCatalog() {
  const cached = await readRedisJson<MotorbikeCatalogItem[]>(
    MOTORBIKE_CATALOG_CACHE_KEY,
  )
  if (cached) {
    return cached
  }

  const items = await loadCachedMotorbikeCatalog()
  await writeRedisJson(MOTORBIKE_CATALOG_CACHE_KEY, items, 300)
  return items
}

// React cache deduplicates calls within one render. The Next data cache keeps the
// public catalog warm across requests while still refreshing external DB changes.
export const listMotorbikeCatalog = cache(loadDistributedMotorbikeCatalog)

export async function getMotorbikeCatalogBySlug(slug: string) {
  const detailKey = motorbikeDetailCacheKey(slug)
  const cached = await readRedisJson<MotorbikeCatalogItem>(detailKey)
  if (cached) return cached

  const items = await listMotorbikeCatalog()
  const item = items.find((entry) => entry.slug === slug) ?? null
  if (item) await writeRedisJson(detailKey, item, 300)
  return item
}

export async function getMotorbikeCatalogByName(name: string) {
  const normalized = name.trim().toLocaleLowerCase('vi')
  const items = await listMotorbikeCatalog()
  return items.find((item) => item.name.toLocaleLowerCase('vi') === normalized) ?? null
}
