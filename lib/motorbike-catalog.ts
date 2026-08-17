import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { MOTORBIKE_CATALOG_CACHE_KEY } from '@/lib/cache-keys'
import { readRedisJson, writeRedisJson } from '@/lib/redis'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { DEFAULT_MOTORBIKE_SPEC_FIELDS, mergeVehicleSpecFields, normalizeMotorbikeSpecFields, type VehicleSpecField } from '@/lib/vehicle-specifications'
import { normalizeMotorbikeVersionName } from '@/lib/motorbike-version'
import type { VehicleCatalogParityItem } from '@/lib/catalog/vehicle-read-contract'

type JsonRecord = Record<string, unknown>

export type MotorbikeCatalogColor = {
  name: string
  imageUrl: string
  swatchUrl: string
  type: 'STANDARD' | 'ADVANCED'
  priceAdjustment: number
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
  imageCarUrl: string
  imageColorUrl: string
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
  specificationFields: VehicleSpecField[]
  displayedPrice: number
  colors: MotorbikeCatalogColor[]
  versions: MotorbikeCatalogVersion[]
  variantRows: MotorbikeCatalogVariantRow[]
}

type VehicleVariantRow = {
  id: string
  product_id: string
  product_variant_id: string | null
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

type ActiveProductRow = {
  id: string
  product_variants?: ActiveProductVariant[] | null
}

type ActiveProductVariant = {
  id: string
  sku: string
  original_price: number | string
  sale_price: number | string | null
  is_active: boolean
}

export const MOTORBIKE_CATALOG_PRODUCT_TYPE_VALUES = ['BIKE', 'MOTORBIKE'] as const

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

function effectiveProductVariantPrice(variant: ActiveProductVariant) {
  const salePrice = number(variant.sale_price)
  const originalPrice = number(variant.original_price)
  return salePrice > 0 ? salePrice : originalPrice > 0 ? originalPrice : null
}

function normalizedSku(value: string) {
  return value.trim().replace(/-C\d{2}$/i, '').toUpperCase()
}

function buildAuthorityPriceMap(rows: ActiveProductRow[]) {
  const prices = new Map<string, number>()
  for (const product of rows) {
    const productPrices = (product.product_variants ?? [])
      .filter((variant) => variant.is_active !== false)
      .flatMap((variant) => {
        const price = effectiveProductVariantPrice(variant)
        return price === null ? [] : [{ id: variant.id, sku: normalizedSku(variant.sku), price }]
      })
    for (const variant of productPrices) {
      const key = `${product.id}:variant:${variant.id}`
      const current = prices.get(key)
      if (current === undefined || variant.price < current) prices.set(key, variant.price)
      const skuKey = `${product.id}:sku:${normalizedSku(variant.sku)}`
      const currentSkuPrice = prices.get(skuKey)
      if (currentSkuPrice === undefined || variant.price < currentSkuPrice) prices.set(skuKey, variant.price)
    }
    const minimum = productPrices.reduce<number | null>((current, variant) => current === null ? variant.price : Math.min(current, variant.price), null)
    if (minimum !== null) prices.set(`${product.id}:*`, minimum)
  }
  return prices
}

function mapRows(rows: VehicleVariantRow[], authorityPrices = new Map<string, number>()): MotorbikeCatalogItem[] {
  const grouped = new Map<string, VehicleVariantRow[]>()
  for (const row of rows) {
    const group = grouped.get(row.product_id) ?? []
    group.push(row)
    grouped.set(row.product_id, group)
  }

  return [...grouped.values()].map((productRows) => {
    const sourceRows = productRows.map((row) => {
      const authorityPrice = (row.product_variant_id
        ? authorityPrices.get(`${row.product_id}:variant:${row.product_variant_id}`)
        : undefined)
        ?? authorityPrices.get(`${row.product_id}:sku:${normalizedSku(row.sku)}`)
      if (authorityPrice === undefined) {
        throw new Error(`Không thể dựng giá xe máy điện ${row.product_id}: thiếu product_variants authority cho SKU ${row.sku}.`)
      }
      return { ...row, price: authorityPrice }
    })
    const first = sourceRows[0]
    const rootSpecs = record(first.specs)
    const catalog = record(rootSpecs.catalog)
    const technicalSpecifications = record(rootSpecs.specs)
    const specifications = Object.keys(technicalSpecifications).length > 0
      ? technicalSpecifications
      : Object.fromEntries(
          Object.entries(rootSpecs).filter(([key]) => key !== 'catalog'),
        )
    const declaredVersions = Array.isArray(rootSpecs.variants) ? rootSpecs.variants : []
    const versionName = (row: VehicleVariantRow) => normalizeMotorbikeVersionName(
      text(row.version) || text(row.variant_name),
      declaredVersions,
      sourceRows.map((candidate) => candidate.color),
      first.product_name,
    )

    const colors = [...new Map(
      sourceRows.map((row) => [row.color, {
        name: row.color,
        imageUrl: row.image_car_url,
        swatchUrl: row.image_color_url,
        type: (record(record(row.specs).catalog).color_type === 'ADVANCED' ? 'ADVANCED' : 'STANDARD') as 'STANDARD' | 'ADVANCED',
        priceAdjustment: number(record(record(row.specs).catalog).color_price_adjustment),
        order: orderOf(row, 'color_order'),
      }]),
    ).values()].sort((left, right) => left.order - right.order)

    const versions = [...new Map(
      sourceRows.map((row) => [versionName(row), {
        id: row.id,
        name: versionName(row),
        sku: text(record(record(row.specs).catalog).version_sku) || row.sku,
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
      specificationFields: mergeVehicleSpecFields(
        normalizeMotorbikeSpecFields(rootSpecs.specification_fields),
        specifications,
        'Kích thước & Tiện ích',
        DEFAULT_MOTORBIKE_SPEC_FIELDS,
      ),
      displayedPrice: authorityPrices.get(`${first.product_id}:*`)
        ?? Math.min(...versions.map((version) => version.price)),
      colors,
      versions,
      variantRows: sourceRows.map((row) => ({
        id: row.id,
        version: versionName(row),
        color: row.color,
        sku: row.sku,
        price: number(row.price),
        depositAmount: number(row.deposit_amount),
        imageCarUrl: row.image_car_url,
        imageColorUrl: row.image_color_url,
      })),
    }
  }).sort((left, right) => left.name.localeCompare(right.name, 'vi'))
}

async function loadMotorbikeCatalog(): Promise<MotorbikeCatalogItem[]> {
  const supabase = getSupabaseAdmin()
  const publishedAggregate = await supabase.rpc('list_published_motorbike_catalog')
  if (!publishedAggregate.error) {
    const rows = ((publishedAggregate.data ?? []) as MotorbikeCatalogReadRow[]).flatMap((product) =>
      (product.variants ?? []).map((variant) => ({
        ...variant,
        product_id: product.product_id,
        product_name: product.product_name,
        specs: product.shared_specs,
      })),
    )
    return mapRows(rows)
  }

  // `vehicle_variants.is_active` describes a sellable colour/version row, while
  // `products.is_active` is the publication state of the whole model. Check the
  // latter explicitly as well: legacy RPC rows can otherwise keep a draft model
  // visible in /bikes and lead users to a 404 detail page.
  const [aggregate, activeProducts] = await Promise.all([
    supabase.rpc('list_active_motorbike_catalog'),
    supabase
      .from('products')
      .select('id,product_variants(id,sku,original_price,sale_price,is_active)')
      .in('product_type', MOTORBIKE_CATALOG_PRODUCT_TYPE_VALUES)
      .eq('is_active', true),
  ])

  if (activeProducts.error) {
    throw new Error(`Unable to load active motorbike products: ${activeProducts.error.message}`)
  }
  const activeProductRows = (activeProducts.data ?? []) as ActiveProductRow[]
  const activeProductIds = new Set(activeProductRows.map((product) => product.id))
  const authorityPrices = buildAuthorityPriceMap(activeProductRows)

  if (!aggregate.error) {
    const rows = ((aggregate.data ?? []) as MotorbikeCatalogReadRow[]).flatMap((product) =>
      activeProductIds.has(product.product_id) ? (product.variants ?? []).map((variant) => ({
        ...variant,
        product_id: product.product_id,
        product_name: product.product_name,
        specs: product.shared_specs,
      })) : [],
    )
    return mapRows(rows, authorityPrices)
  }

  const { data, error } = await supabase
    .from('vehicle_variants')
    .select('id,product_id,product_variant_id,product_name,deposit_amount,specs,variant_name,sku,price,color,image_car_url,image_color_url,version,is_active')
    .in('product_type', MOTORBIKE_CATALOG_PRODUCT_TYPE_VALUES)
    .eq('is_active', true)

  if (error) {
    throw new Error(
      `Unable to load motorbike vehicle variants: ${error.message}; `
      + `catalog read model: ${aggregate.error.message}`,
    )
  }

  return mapRows(((data ?? []) as VehicleVariantRow[]).filter((row) => activeProductIds.has(row.product_id)), authorityPrices)
}

export function toMotorbikeCatalogParityItem(item: Pick<MotorbikeCatalogItem, 'productId' | 'name' | 'displayedPrice'>): VehicleCatalogParityItem {
  return {
    productId: item.productId,
    name: item.name,
    productType: 'BIKE',
    price: item.displayedPrice,
  }
}

function nextCachedMotorbikeCatalog() {
  return unstable_cache(
    loadMotorbikeCatalog,
    ['motorbike-catalog-v3'],
    { revalidate: 300, tags: ['vehicle-catalog', 'motorbike-catalog'] },
  )()
}

async function distributedMotorbikeCatalog() {
  const cached = await readRedisJson<MotorbikeCatalogItem[]>(MOTORBIKE_CATALOG_CACHE_KEY)
  if (cached) return cached

  const result = await nextCachedMotorbikeCatalog()
  await writeRedisJson(MOTORBIKE_CATALOG_CACHE_KEY, result, 300)
  return result
}

// Request-level deduplication wraps a short metadata cache. Every admin create,
// update and delete path invalidates both the tag and Redis key.
export const listMotorbikeCatalog = cache(distributedMotorbikeCatalog)

export async function getMotorbikeCatalogBySlug(slug: string) {
  const items = await listMotorbikeCatalog()
  return items.find((entry) => entry.slug === slug) ?? null
}

export async function getMotorbikeCatalogByName(name: string) {
  const normalized = name.trim().toLocaleLowerCase('vi')
  const items = await listMotorbikeCatalog()
  return items.find((item) => item.name.toLocaleLowerCase('vi') === normalized) ?? null
}
