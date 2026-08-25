import 'server-only'

import { catalogCacheEngine } from '../cache/catalog-cache'
import { resolveCatalogEntitiesRepository, type EntityResolution } from './identity'
import { extractCanonicalVehicleSpecs } from './spec-extractor'
import type {
  EvidenceRecord,
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

export async function getProductDetailsRepository(
  input: GetProductDetailsInput,
  toolCallId: string = `call-details-${Date.now()}`,
): Promise<ToolResult<GetProductDetailsData>> {
  const readAt = new Date().toISOString()
  const dataAsOf = readAt

  let productIds = [...new Set(input.productIds ?? [])]
  let resolutionEvidence: EvidenceRecord[] = []

  if (input.productMentions?.length) {
    const resolution = await resolveCatalogEntitiesRepository({
      references: input.productMentions.map((mention, index) => ({
        clientRef: `product-${index + 1}`,
        mention,
        kindHint: 'PRODUCT' as const,
        productTypes: ['CAR', 'BIKE'] as ProductType[],
      })),
      candidateLimit: 3,
    }, `${toolCallId}-resolve`)
    const resolutions = (Array.isArray(resolution.data?.resolutions) ? resolution.data.resolutions : []) as EntityResolution[]
    const unresolved = resolutions.filter((item) => item.outcome !== 'RESOLVED')

    if (unresolved.length > 0) {
      const needsInput = unresolved.some((item) => item.outcome === 'AMBIGUOUS')
      const candidates = unresolved.flatMap((item) => item.outcome === 'AMBIGUOUS' ? item.candidates : [])
      const question = needsInput
        ? `Bạn muốn chọn mẫu nào: ${candidates.map((candidate) => candidate.name).join(', ')}?`
        : undefined
      return {
        schemaVersion: '2.0',
        toolCallId,
        tool: 'get_product_details',
        readAt,
        dataAsOf,
        evidence: [],
        observation: {
          observationId: `obs-${toolCallId}`,
          toolCallId,
          outcome: needsInput ? 'NEEDS_INPUT' : 'NO_MATCH',
          issueCodes: resolution.issues.map((issue) => issue.code),
          inputHash: JSON.stringify(input),
          readAt,
        },
        issues: resolution.issues,
        appliedBindings: [],
        outcome: needsInput ? 'NEEDS_INPUT' : 'NO_MATCH',
        data: { question, resolutions },
      }
    }

    productIds = [...new Set([
      ...productIds,
      ...resolutions.flatMap((item) => item.outcome === 'RESOLVED' ? [item.entity.id] : []),
    ])]
    resolutionEvidence = resolution.evidence
  }

  const snapshot = await catalogCacheEngine.getSnapshotAsync()
  const productRows = snapshot.products.filter((p) => productIds.includes(p.id))

  const products: ProductDetailsSnapshot[] = []
  const evidence: EvidenceRecord[] = [...resolutionEvidence]

  for (const row of productRows) {
    const pType = row.productType
    const activeVariants = (row.variants ?? []).filter((v) => v.isActive)
    let minPrice: number | null = row.displayedPrice ? Number(row.displayedPrice) : null
    let maxPrice: number | null = minPrice

    const variants: ProductDetailsSnapshot['variants'] = []
    if (activeVariants.length > 0) {
      const prices: number[] = []
      for (const v of activeVariants) {
        const p = v.salePrice != null ? Number(v.salePrice) : Number(v.originalPrice)
        if (!isNaN(p) && p > 0) {
          prices.push(p)
          variants.push({
            id: String(v.id),
            name: v.name,
            sku: v.sku,
            price: p,
            isActive: v.isActive,
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
      { factRef: `fact-active-${row.id}`, factPath: 'publication.isActive', valueHash: 'true' },
    ]

    const specs: ProductDetailsSnapshot['specs'] = {}
    const canonical = extractCanonicalVehicleSpecs(row)

    const canonicalKeyMap: Record<string, string | undefined> = {
      battery_capacity_kwh: canonical.battery,
      battery: canonical.battery,
      top_speed_kmh: canonical.topSpeed,
      topSpeed: canonical.topSpeed,
      range_km: canonical.range,
      range: canonical.range,
      weight: canonical.weight,
      max_power_kw: canonical.power,
      power: canonical.power,
      seats: canonical.seats ? `${canonical.seats} chỗ` : undefined,
      chargingTime: canonical.chargingTime,
      trunk: canonical.trunk,
      warranty: canonical.warranty,
      dimensions: canonical.dimensions,
    }

    for (const [key, val] of Object.entries(canonicalKeyMap)) {
      if (val && val.trim().length > 0) {
        const factRef = `fact-spec-${row.id}-${key}`
        specs[key] = {
          displayValue: val,
          rawValue: val,
          factRef,
        }
        facts.push({
          factRef,
          factPath: `specs.${key}`,
          valueHash: val,
        })
      }
    }

    for (const [key, val] of Object.entries(canonical.rawFlatSpecs)) {
      if (!specs[key] && val && val.trim().length > 0) {
        const factRef = `fact-spec-${row.id}-${key}`
        specs[key] = {
          displayValue: val,
          rawValue: val,
          factRef,
        }
        facts.push({
          factRef,
          factPath: `specs.${key}`,
          valueHash: val,
        })
      }
    }

    const itemUrl = salesAgentProductUrl(pType as any, row.slug)
    products.push({
      productId: String(row.id),
      name: row.name,
      slug: row.slug,
      productType: pType,
      thumbnailUrl: row.thumbnailUrl || (Array.isArray(row.imageUrls) ? row.imageUrls[0] : null),
      description: row.description,
      pricing: {
        from: minPrice,
        to: maxPrice !== minPrice ? maxPrice : null,
        currency: 'VND',
      },
      specs,
      variants,
      publication: {
        isActive: true,
        url: itemUrl,
        sourceUpdatedAt: row.updatedAt,
      },
    })

    evidence.push({
      evidenceId: `ev-details-${row.id}-${readAt}`,
      source: { system: 'SUPABASE', resource: 'products' },
      entity: { kind: 'PRODUCT', id: String(row.id) },
      facts,
      readAt,
      sourceUpdatedAt: row.updatedAt ?? undefined,
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
    completeness: products.length === productIds.length ? 'FULL' : 'PARTIAL',
    data: { products },
  }
}
