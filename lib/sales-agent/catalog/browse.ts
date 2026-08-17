import 'server-only'

import { catalogCacheEngine } from '../cache/catalog-cache'
import type {
  BrowseCatalogInput,
  EvidenceRecord,
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

export async function browseCatalogRepository(
  input: BrowseCatalogInput,
  toolCallId: string = `call-browse-${Date.now()}`,
): Promise<ToolResult<BrowseCatalogData, never, { items: [] }>> {
  const readAt = new Date().toISOString()
  const dataAsOf = readAt

  const limit = input.page?.limit ?? 10
  const isDesc = input.sort?.direction === 'DESC'
  const requestedTypes = (input.productTypes && input.productTypes.length > 0)
    ? input.productTypes
    : ['CAR', 'BIKE'] as ProductType[]

  const snapshot = await catalogCacheEngine.getSnapshotAsync()
  let filtered = snapshot.products.filter((p) => requestedTypes.includes(p.productType))

  if (input.price?.min !== undefined) {
    filtered = filtered.filter((p) => (p.displayedPrice ?? 0) >= input.price!.min!)
  }
  if (input.price?.max !== undefined) {
    filtered = filtered.filter((p) => (p.displayedPrice ?? Infinity) <= input.price!.max!)
  }

  // Sort
  if (input.sort?.field === 'NAME') {
    filtered.sort((a, b) => isDesc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name))
  } else {
    filtered.sort((a, b) => {
      const pA = a.displayedPrice ?? 0
      const pB = b.displayedPrice ?? 0
      return isDesc ? pB - pA : pA - pB
    })
  }

  const hasMore = filtered.length > limit
  const rows = filtered.slice(0, limit)

  const items: CatalogBrowseItem[] = []
  const evidence: EvidenceRecord[] = []

  for (const row of rows) {
    const pType = row.productType
    const activeVariants = (row.variants ?? []).filter((v) => v.isActive)
    let effectivePrice = row.displayedPrice ? Number(row.displayedPrice) : null
    let originalPrice: number | null = null
    let salePrice: number | null = null
    let minPrice = effectivePrice ?? Infinity
    let maxPrice = effectivePrice ?? 0

    if (activeVariants.length > 0) {
      const variantPrices: number[] = []
      for (const v of activeVariants) {
        const p = v.salePrice != null ? Number(v.salePrice) : Number(v.originalPrice)
        if (!isNaN(p) && p > 0) {
          variantPrices.push(p)
          if (p < minPrice) minPrice = p
          if (p > maxPrice) maxPrice = p
        }
      }
      if (variantPrices.length > 0) {
        effectivePrice = Math.min(...variantPrices)
        const primaryVariant = activeVariants[0]
        originalPrice = primaryVariant.originalPrice != null ? Number(primaryVariant.originalPrice) : null
        salePrice = primaryVariant.salePrice != null ? Number(primaryVariant.salePrice) : null
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
      thumbnailUrl: row.thumbnailUrl || (Array.isArray(row.imageUrls) ? row.imageUrls[0] : null),
      price: effectivePrice,
      originalPrice,
      salePrice,
      priceRange,
      summary: row.description,
      url: itemUrl,
      isActive: true,
      sourceUpdatedAt: row.updatedAt,
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
      sourceUpdatedAt: row.updatedAt ?? undefined,
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
