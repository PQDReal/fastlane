import 'server-only'

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type {
  EvidenceRecord,
  FactPointer,
  GetProductDetailsInput,
  ProductType,
  ToolObservationRef,
  ToolResult,
} from '../contracts'
import { salesAgentProductUrl } from '../navigation/paths'

export type ProductDetailsSnapshot = {
  productId: string
  name: string
  slug: string
  productType: ProductType
  thumbnailUrl: string | null
  description: string | null
  pricing: {
    from: number | null
    to: number | null
    currency: 'VND'
  }
  specs: Record<string, { displayValue: string; rawValue: unknown; factRef: string }>
  variants: Array<{
    id: string
    name: string
    sku: string
    price: number
    isActive: boolean
  }>
  publication: {
    isActive: boolean
    url: string
    sourceUpdatedAt: string | null
  }
}

export type GetProductDetailsData = {
  products: ProductDetailsSnapshot[]
}

function mapDatabaseProductType(type: string): ProductType | null {
  const upper = (type || '').toUpperCase()
  if (upper === 'CAR' || upper === 'VEHICLE') return 'CAR'
  if (upper === 'BIKE' || upper === 'MOTORBIKE') return 'BIKE'
  if (upper === 'ACCESSORY') return 'ACCESSORY'
  return null
}

export async function getProductDetailsRepository(
  input: GetProductDetailsInput,
  toolCallId: string = `call-details-${Date.now()}`,
): Promise<ToolResult<GetProductDetailsData>> {
  const readAt = new Date().toISOString()
  const dataAsOf = readAt
  const client = getSupabaseAdmin()

  const { data: rows, error } = await client
    .from('products')
    .select(`
      id,
      name,
      slug,
      description,
      product_type,
      displayed_price,
      image_urls,
      thumbnail_url,
      specifications,
      is_active,
      updated_at,
      product_variants (
        id,
        name,
        sku,
        original_price,
        sale_price,
        is_active
      ),
      vehicle_variants (
        id,
        product_variant_id,
        version,
        color,
        is_active
      )
    `)
    .in('id', input.productIds)

  if (error) {
    const observation: ToolObservationRef = {
      observationId: `obs-${toolCallId}`,
      toolCallId,
      outcome: 'UNAVAILABLE',
      issueCodes: ['RESOURCE_UNAVAILABLE'],
      inputHash: JSON.stringify(input),
      readAt,
    }
    return {
      schemaVersion: '2.0',
      toolCallId,
      tool: 'get_product_details',
      readAt,
      dataAsOf,
      evidence: [],
      observation,
      issues: [{ code: 'RESOURCE_UNAVAILABLE', message: error.message }],
      appliedBindings: [],
      outcome: 'UNAVAILABLE',
      data: null,
    }
  }

  const products: ProductDetailsSnapshot[] = []
  const evidence: EvidenceRecord[] = []
  const productRows = (rows ?? []) as any[]

  for (const row of productRows) {
    const pType = mapDatabaseProductType(row.product_type) || 'CAR'
    const activeVariants = (row.product_variants ?? []).filter((v: any) => v.is_active)
    let minPrice: number | null = row.displayed_price ? Number(row.displayed_price) : null
    let maxPrice: number | null = minPrice

    const variants: ProductDetailsSnapshot['variants'] = []
    if (activeVariants.length > 0) {
      const prices: number[] = []
      for (const v of activeVariants) {
        const p = v.sale_price != null ? Number(v.sale_price) : Number(v.original_price)
        if (!isNaN(p) && p > 0) {
          prices.push(p)
          variants.push({
            id: String(v.id),
            name: v.name,
            sku: v.sku,
            price: p,
            isActive: v.is_active,
          })
        }
      }
      if (prices.length > 0) {
        minPrice = Math.min(...prices)
        maxPrice = Math.max(...prices)
      }
    }

    const facts: Array<{ factRef: string; factPath: string; valueHash: string }> = [
      { factRef: `fact-price-${row.id}`, factPath: 'pricing.from', valueHash: String(minPrice) },
      { factRef: `fact-name-${row.id}`, factPath: 'name', valueHash: row.name },
      { factRef: `fact-slug-${row.id}`, factPath: 'slug', valueHash: row.slug },
      { factRef: `fact-active-${row.id}`, factPath: 'publication.isActive', valueHash: String(row.is_active) },
    ]

    const specs: ProductDetailsSnapshot['specs'] = {}
    const rawSpecs = (row.specifications && typeof row.specifications === 'object') ? row.specifications : {}
    for (const [key, val] of Object.entries(rawSpecs)) {
      const factRef = `fact-spec-${row.id}-${key}`
      const displayVal = String(val)
      specs[key] = {
        displayValue: displayVal,
        rawValue: val,
        factRef,
      }
      facts.push({
        factRef,
        factPath: `specs.${key}`,
        valueHash: displayVal,
      })
    }

    const itemUrl = salesAgentProductUrl(pType as any, row.slug)
    products.push({
      productId: String(row.id),
      name: row.name,
      slug: row.slug,
      productType: pType,
      thumbnailUrl: row.thumbnail_url || (Array.isArray(row.image_urls) ? row.image_urls[0] : null),
      description: row.description,
      pricing: {
        from: minPrice,
        to: maxPrice !== minPrice ? maxPrice : null,
        currency: 'VND',
      },
      specs,
      variants,
      publication: {
        isActive: Boolean(row.is_active),
        url: itemUrl,
        sourceUpdatedAt: row.updated_at,
      },
    })

    evidence.push({
      evidenceId: `ev-details-${row.id}-${readAt}`,
      source: { system: 'SUPABASE', resource: 'products' },
      entity: { kind: 'PRODUCT', id: String(row.id) },
      facts,
      readAt,
      sourceUpdatedAt: row.updated_at,
    })
  }

  const observation: ToolObservationRef = {
    observationId: `obs-${toolCallId}`,
    toolCallId,
    outcome: products.length > 0 ? 'SUCCESS' : 'NO_MATCH',
    issueCodes: products.length === 0 ? ['UNKNOWN_ENTITY_REFERENCE'] : [],
    inputHash: JSON.stringify(input),
    readAt,
  }

  if (products.length === 0) {
    return {
      schemaVersion: '2.0',
      toolCallId,
      tool: 'get_product_details',
      readAt,
      dataAsOf,
      evidence: [],
      observation,
      issues: [{ code: 'UNKNOWN_ENTITY_REFERENCE', message: 'Không tìm thấy chi tiết sản phẩm.' }],
      appliedBindings: [],
      outcome: 'NO_MATCH',
      data: { products: [] },
    }
  }

  return {
    schemaVersion: '2.0',
    toolCallId,
    tool: 'get_product_details',
    readAt,
    dataAsOf,
    evidence,
    observation,
    issues: [],
    appliedBindings: [],
    outcome: 'SUCCESS',
    completeness: products.length === input.productIds.length ? 'FULL' : 'PARTIAL',
    data: { products },
  }
}
