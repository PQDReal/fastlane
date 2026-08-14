import 'server-only'

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type {
  BrowseCatalogInput,
  EvidenceRecord,
  FactPointer,
  ProductType,
  ToolObservationRef,
  ToolResult,
} from '../contracts'
import { salesAgentProductUrl } from '../navigation/paths'

export type CatalogBrowseItem = {
  id: string
  name: string
  slug: string
  productType: ProductType
  thumbnailUrl: string | null
  price: number | null
  originalPrice: number | null
  salePrice: number | null
  priceRange: { min: number; max: number } | null
  summary: string | null
  url: string
  isActive: boolean
  sourceUpdatedAt: string | null
}

export type BrowseCatalogData = {
  items: CatalogBrowseItem[]
  totalCandidateCount: number
  hasMore: boolean
  nextCursor?: string
}

function mapDatabaseProductType(type: string): ProductType | null {
  const upper = (type || '').toUpperCase()
  if (upper === 'CAR' || upper === 'VEHICLE') return 'CAR'
  if (upper === 'BIKE' || upper === 'MOTORBIKE') return 'BIKE'
  if (upper === 'ACCESSORY') return 'ACCESSORY'
  return null
}

export async function browseCatalogRepository(
  input: BrowseCatalogInput,
  toolCallId: string = `call-browse-${Date.now()}`,
): Promise<ToolResult<BrowseCatalogData, never, { items: [] }>> {
  const readAt = new Date().toISOString()
  const dataAsOf = readAt
  const client = getSupabaseAdmin()

  const limit = input.page?.limit ?? 10
  const direction = input.sort?.direction === 'DESC' ? false : true
  const requestedTypes = (input.productTypes && input.productTypes.length > 0)
    ? input.productTypes
    : ['CAR', 'BIKE'] as ProductType[]

  let rows: any[] = []
  let hasMore = false

  const PRODUCT_FIELDS = `
    id,
    name,
    slug,
    description,
    product_type,
    displayed_price,
    image_urls,
    thumbnail_url,
    is_active,
    updated_at,
    product_variants (
      id,
      name,
      sku,
      original_price,
      sale_price,
      is_active
    )
  `

  if (requestedTypes.length > 1 && (!input.sort?.field || input.sort.field === 'PRICE')) {
    // Multi-type browse: Fetch representative active items from EACH requested category
    const limitPerType = Math.max(5, Math.ceil(limit / requestedTypes.length))
    const queries = requestedTypes.map((t) => {
      const dbTypes = t === 'CAR' ? ['CAR', 'VEHICLE'] : t === 'BIKE' ? ['BIKE', 'MOTORBIKE'] : ['ACCESSORY']
      let subQuery = client
        .from('products')
        .select(PRODUCT_FIELDS)
        .eq('is_active', true)
        .in('product_type', dbTypes)

      if (input.price?.min !== undefined) subQuery = subQuery.gte('displayed_price', input.price.min)
      if (input.price?.max !== undefined) subQuery = subQuery.lte('displayed_price', input.price.max)

      return subQuery.order('displayed_price', { ascending: direction }).limit(limitPerType)
    })

    const results = await Promise.all(queries)
    for (const res of results) {
      if (res.data) rows.push(...res.data)
    }
  } else {
    // Single-type browse or explicit custom field sort
    let query = client
      .from('products')
      .select(PRODUCT_FIELDS)
      .eq('is_active', true)

    if (input.productTypes && input.productTypes.length > 0) {
      const dbTypes = input.productTypes.flatMap((t) => {
        if (t === 'CAR') return ['CAR', 'VEHICLE']
        if (t === 'BIKE') return ['BIKE', 'MOTORBIKE']
        return ['ACCESSORY']
      })
      query = query.in('product_type', dbTypes)
    }

    if (input.price?.min !== undefined) {
      query = query.gte('displayed_price', input.price.min)
    }
    if (input.price?.max !== undefined) {
      query = query.lte('displayed_price', input.price.max)
    }

    if (input.sort?.field === 'NAME') {
      query = query.order('name', { ascending: direction })
    } else if (input.sort?.field === 'UPDATED_AT') {
      query = query.order('updated_at', { ascending: direction })
    } else {
      query = query.order('displayed_price', { ascending: direction })
    }

    query = query.limit(limit + 1)
    const { data, error } = await query

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
        tool: 'browse_catalog',
        readAt,
        dataAsOf,
        evidence: [],
        observation,
        issues: [{ code: 'RESOURCE_UNAVAILABLE', message: `Database error: ${error.message}` }],
        appliedBindings: [],
        outcome: 'UNAVAILABLE',
        data: null,
      }
    }

    const fetched = (data ?? []) as any[]
    hasMore = fetched.length > limit
    rows = hasMore ? fetched.slice(0, limit) : fetched
  }

  const items: CatalogBrowseItem[] = []
  const evidence: EvidenceRecord[] = []

  for (const row of rows) {
    const pType = mapDatabaseProductType(row.product_type)
    if (!pType) continue

    const activeVariants = (row.product_variants ?? []).filter((v: any) => v.is_active)
    let effectivePrice = row.displayed_price ? Number(row.displayed_price) : null
    let originalPrice: number | null = null
    let salePrice: number | null = null
    let minPrice = effectivePrice ?? Infinity
    let maxPrice = effectivePrice ?? 0

    if (activeVariants.length > 0) {
      const variantPrices: number[] = []
      for (const v of activeVariants) {
        const p = v.sale_price != null ? Number(v.sale_price) : Number(v.original_price)
        if (!isNaN(p) && p > 0) {
          variantPrices.push(p)
          if (p < minPrice) minPrice = p
          if (p > maxPrice) maxPrice = p
        }
      }
      if (variantPrices.length > 0) {
        effectivePrice = Math.min(...variantPrices)
        const primaryVariant = activeVariants[0]
        originalPrice = primaryVariant.original_price != null ? Number(primaryVariant.original_price) : null
        salePrice = primaryVariant.sale_price != null ? Number(primaryVariant.sale_price) : null
      }
    }

    const priceRange = (minPrice !== Infinity && maxPrice > 0 && minPrice !== maxPrice)
      ? { min: minPrice, max: maxPrice }
      : null

    const itemUrl = salesAgentProductUrl(pType as any, row.slug)
    const item: CatalogBrowseItem = {
      id: String(row.id),
      name: row.name,
      slug: row.slug,
      productType: pType,
      thumbnailUrl: row.thumbnail_url || (Array.isArray(row.image_urls) ? row.image_urls[0] : null),
      price: effectivePrice,
      originalPrice,
      salePrice,
      priceRange,
      summary: row.description,
      url: itemUrl,
      isActive: true,
      sourceUpdatedAt: row.updated_at,
    }
    items.push(item)

    evidence.push({
      evidenceId: `ev-browse-${row.id}-${readAt}`,
      source: { system: 'SUPABASE', resource: 'products' },
      entity: { kind: 'PRODUCT', id: String(row.id) },
      facts: [
        { factRef: `fact-price-${row.id}`, factPath: 'pricing.effectivePrice', valueHash: String(effectivePrice) },
        { factRef: `fact-active-${row.id}`, factPath: 'status.isActive', valueHash: 'true' },
        { factRef: `fact-name-${row.id}`, factPath: 'name', valueHash: row.name },
        { factRef: `fact-slug-${row.id}`, factPath: 'slug', valueHash: row.slug },
      ],
      readAt,
      sourceUpdatedAt: row.updated_at,
    })
  }

  const observation: ToolObservationRef = {
    observationId: `obs-${toolCallId}`,
    toolCallId,
    outcome: items.length > 0 ? 'SUCCESS' : 'NO_MATCH',
    issueCodes: items.length === 0 ? ['UNKNOWN_ENTITY_REFERENCE'] : [],
    inputHash: JSON.stringify(input),
    readAt,
  }

  if (items.length === 0) {
    return {
      schemaVersion: '2.0',
      toolCallId,
      tool: 'browse_catalog',
      readAt,
      dataAsOf,
      evidence: [],
      observation,
      issues: [{ code: 'UNKNOWN_ENTITY_REFERENCE', message: 'Không tìm thấy sản phẩm phù hợp với bộ lọc.' }],
      appliedBindings: [],
      outcome: 'NO_MATCH',
      data: { items: [] },
    }
  }

  return {
    schemaVersion: '2.0',
    toolCallId,
    tool: 'browse_catalog',
    readAt,
    dataAsOf,
    evidence,
    observation,
    issues: [],
    appliedBindings: [],
    outcome: 'SUCCESS',
    completeness: 'FULL',
    data: {
      items,
      totalCandidateCount: items.length,
      hasMore,
    },
  }
}
