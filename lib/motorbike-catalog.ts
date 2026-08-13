import 'server-only'

import { cache } from 'react'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { DEFAULT_MOTORBIKE_SPEC_FIELDS, mergeVehicleSpecFields, normalizeMotorbikeSpecFields, type VehicleSpecField } from '@/lib/vehicle-specifications'

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

function normalizedVersion(row: VehicleVariantRow): string {
  const version = text(row.version) || text(row.variant_name)
  const color = text(row.color)
  const suffix = color ? ` - ${color}` : ''
  return suffix && version.toLocaleLowerCase().endsWith(suffix.toLocaleLowerCase())
    ? version.slice(0, -suffix.length).trim()
    : version
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
        type: (record(record(row.specs).catalog).color_type === 'ADVANCED' ? 'ADVANCED' : 'STANDARD') as 'STANDARD' | 'ADVANCED',
        priceAdjustment: number(record(record(row.specs).catalog).color_price_adjustment),
        order: orderOf(row, 'color_order'),
      }]),
    ).values()].sort((left, right) => left.order - right.order)

    const versions = [...new Map(
      productRows.map((row) => [normalizedVersion(row), {
        id: row.id,
        name: normalizedVersion(row),
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
      specificationFields: mergeVehicleSpecFields(
        normalizeMotorbikeSpecFields(rootSpecs.specification_fields),
        specifications,
        'Kích thước & Tiện ích',
        DEFAULT_MOTORBIKE_SPEC_FIELDS,
      ),
      displayedPrice: Math.min(...versions.map((version) => version.price)),
      colors,
      versions,
      variantRows: productRows.map((row) => ({
        id: row.id,
        version: normalizedVersion(row),
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
  // `vehicle_variants.is_active` describes a sellable colour/version row, while
  // `products.is_active` is the publication state of the whole model. Check the
  // latter explicitly as well: legacy RPC rows can otherwise keep a draft model
  // visible in /bikes and lead users to a 404 detail page.
  const [aggregate, activeProducts] = await Promise.all([
    supabase.rpc('list_active_motorbike_catalog'),
    supabase
      .from('products')
      .select('id')
      .eq('product_type', 'BIKE')
      .eq('is_active', true),
  ])

  if (activeProducts.error) {
    throw new Error(`Unable to load active motorbike products: ${activeProducts.error.message}`)
  }
  const activeProductIds = new Set((activeProducts.data ?? []).map((product) => product.id))

  if (!aggregate.error) {
    const rows = ((aggregate.data ?? []) as MotorbikeCatalogReadRow[]).flatMap((product) =>
      activeProductIds.has(product.product_id) ? (product.variants ?? []).map((variant) => ({
        ...variant,
        product_id: product.product_id,
        product_name: product.product_name,
        specs: product.shared_specs,
      })) : [],
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

  return mapRows(((data ?? []) as VehicleVariantRow[]).filter((row) => activeProductIds.has(row.product_id)))
}

// React cache only deduplicates calls within the current request. Do not persist
// the catalog here: admin/backend edits must be visible after the next reload.
export const listMotorbikeCatalog = cache(loadMotorbikeCatalog)

export async function getMotorbikeCatalogBySlug(slug: string) {
  const items = await listMotorbikeCatalog()
  return items.find((entry) => entry.slug === slug) ?? null
}

export async function getMotorbikeCatalogByName(name: string) {
  const normalized = name.trim().toLocaleLowerCase('vi')
  const items = await listMotorbikeCatalog()
  return items.find((item) => item.name.toLocaleLowerCase('vi') === normalized) ?? null
}
