import 'server-only'

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { normalizeProductSearchText } from '@/lib/catalog/search'
import type {
  EvidenceRecord,
  ProductTypeV2,
  ResolveCatalogEntitiesInput,
  ToolObservationRefV2,
  ToolResultV2,
} from '../../contracts/v2'

export type EntityResolutionV2 =
  | {
      clientRef: string
      outcome: 'RESOLVED'
      entity: { kind: 'PRODUCT' | 'ACCESSORY_CATEGORY'; id: string; name: string; slug: string; productType: ProductTypeV2 }
      matchMethod: 'NAME_EXACT' | 'SLUG_EXACT' | 'ALIAS_EXACT' | 'FUZZY'
    }
  | {
      clientRef: string
      outcome: 'AMBIGUOUS'
      candidates: Array<{
        kind: 'PRODUCT' | 'ACCESSORY_CATEGORY'
        id: string
        name: string
        slug: string
        productType: ProductTypeV2
      }>
    }
  | { clientRef: string; outcome: 'NO_MATCH' }

export type ResolveCatalogEntitiesResultData = {
  resolutions: EntityResolutionV2[]
}

type ProductIdentityRow = {
  id: string
  name: string
  slug: string
  product_type: string | null
  is_active: boolean
}

const IDENTITY_SELECT = 'id,name,slug,product_type,is_active'
const VEHICLE_TYPES = ['CAR', 'VEHICLE', 'BIKE', 'MOTORBIKE', 'ACCESSORY']

function mapProductType(value: string | null): ProductTypeV2 {
  const normalized = value?.toUpperCase()
  if (normalized === 'ACCESSORY') return 'ACCESSORY'
  if (normalized === 'BIKE' || normalized === 'MOTORBIKE') return 'BIKE'
  return 'CAR'
}

export async function resolveCatalogEntitiesRepository(
  input: ResolveCatalogEntitiesInput,
  toolCallId: string,
): Promise<ToolResultV2<ResolveCatalogEntitiesResultData>> {
  const readAt = new Date().toISOString()
  const dataAsOf = readAt
  const client = getSupabaseAdmin()

  const { data, error } = await client
    .from('products')
    .select(IDENTITY_SELECT)
    .eq('is_active', true)
    .in('product_type', VEHICLE_TYPES)
    .limit(100)

  if (error) {
    const observation: ToolObservationRefV2 = {
      observationId: `obs-${toolCallId}`,
      toolCallId,
      outcome: 'UNAVAILABLE',
      issueCodes: ['DATA_SOURCE_ERROR'],
      inputHash: JSON.stringify(input),
      readAt,
    }
    return {
      schemaVersion: '2.0',
      toolCallId,
      tool: 'resolve_catalog_entities',
      readAt,
      dataAsOf,
      evidence: [],
      observation,
      issues: [{
        code: 'DATA_SOURCE_ERROR',
        severity: 'ERROR',
        recovery: 'Thử lại sau ít phút.',
        message: `Lỗi đọc identity catalog: ${error.message}`,
      }],
      appliedBindings: [],
      outcome: 'UNAVAILABLE',
      data: null,
    }
  }

  const identityRows = (data ?? []) as unknown as ProductIdentityRow[]
  const productIdentities = identityRows.map((row) => {
    const normName = normalizeProductSearchText(row.name)
    const shortName = normName.replace(/^vinfast /, '')
    const normSlug = normalizeProductSearchText(row.slug).replace(/-/g, ' ')
    const pType = mapProductType(row.product_type)
    return {
      id: String(row.id),
      name: String(row.name),
      slug: String(row.slug),
      productType: pType,
      normName,
      shortName,
      normSlug,
    }
  })

  const resolutions: EntityResolutionV2[] = input.references.map((ref) => {
    const normMention = normalizeProductSearchText(ref.mention)
    if (!normMention) {
      return { clientRef: ref.clientRef, outcome: 'NO_MATCH' }
    }

    // 1. Exact Name match
    const exactNameMatch = productIdentities.find(
      (p) => p.normName === normMention || p.shortName === normMention,
    )
    if (exactNameMatch) {
      return {
        clientRef: ref.clientRef,
        outcome: 'RESOLVED',
        entity: {
          kind: 'PRODUCT',
          id: exactNameMatch.id,
          name: exactNameMatch.name,
          slug: exactNameMatch.slug,
          productType: exactNameMatch.productType,
        },
        matchMethod: 'NAME_EXACT',
      }
    }

    // 2. Exact Slug match
    const exactSlugMatch = productIdentities.find(
      (p) => p.normSlug === normMention || p.slug.toLowerCase() === ref.mention.toLowerCase().trim(),
    )
    if (exactSlugMatch) {
      return {
        clientRef: ref.clientRef,
        outcome: 'RESOLVED',
        entity: {
          kind: 'PRODUCT',
          id: exactSlugMatch.id,
          name: exactSlugMatch.name,
          slug: exactSlugMatch.slug,
          productType: exactSlugMatch.productType,
        },
        matchMethod: 'SLUG_EXACT',
      }
    }

    // 3. Substring / Token containment exact
    const substringMatches = productIdentities.filter(
      (p) => normMention.includes(p.shortName) || normMention.includes(p.normName) || p.shortName.includes(normMention),
    )

    if (substringMatches.length === 1) {
      const match = substringMatches[0]
      return {
        clientRef: ref.clientRef,
        outcome: 'RESOLVED',
        entity: {
          kind: 'PRODUCT',
          id: match.id,
          name: match.name,
          slug: match.slug,
          productType: match.productType,
        },
        matchMethod: 'ALIAS_EXACT',
      }
    }

    if (substringMatches.length > 1) {
      // Prioritize match with closest length
      const exactCandidate = substringMatches.find((p) => p.shortName === normMention)
      if (exactCandidate) {
        return {
          clientRef: ref.clientRef,
          outcome: 'RESOLVED',
          entity: {
            kind: 'PRODUCT',
            id: exactCandidate.id,
            name: exactCandidate.name,
            slug: exactCandidate.slug,
            productType: exactCandidate.productType,
          },
          matchMethod: 'ALIAS_EXACT',
        }
      }

      return {
        clientRef: ref.clientRef,
        outcome: 'AMBIGUOUS',
        candidates: substringMatches.slice(0, input.candidateLimit ?? 3).map((p) => ({
          kind: 'PRODUCT' as const,
          id: p.id,
          name: p.name,
          slug: p.slug,
          productType: p.productType,
        })),
      }
    }

    // 4. Bounded Fuzzy matching (requires matching all distinctive tokens, especially model numbers)
    const mentionTokens = normMention.split(' ').filter(Boolean)
    const distinctiveTokens = mentionTokens.filter((t) => t !== 'vinfast' && t !== 'xe')
    const numberTokens = mentionTokens.filter((t) => /^\d+$/.test(t))

    const fuzzyCandidates = productIdentities.filter((p) => {
      const pTokens = p.shortName.split(' ').filter(Boolean)
      // If mention contains numbers, product must contain those exact numbers
      if (numberTokens.length > 0) {
        const hasNumbers = numberTokens.every((num) => pTokens.includes(num))
        if (!hasNumbers) return false
      }
      // If mention has distinctive tokens (e.g. 'klara', 'evo', 'feliz'), check match
      const matchedDistinctive = distinctiveTokens.filter((t) => pTokens.includes(t))
      return matchedDistinctive.length === distinctiveTokens.length && distinctiveTokens.length > 0
    })

    if (fuzzyCandidates.length === 1) {
      const match = fuzzyCandidates[0]
      return {
        clientRef: ref.clientRef,
        outcome: 'RESOLVED',
        entity: {
          kind: 'PRODUCT',
          id: match.id,
          name: match.name,
          slug: match.slug,
          productType: match.productType,
        },
        matchMethod: 'FUZZY',
      }
    }

    if (fuzzyCandidates.length > 1) {
      return {
        clientRef: ref.clientRef,
        outcome: 'AMBIGUOUS',
        candidates: fuzzyCandidates.slice(0, input.candidateLimit ?? 3).map((p) => ({
          kind: 'PRODUCT' as const,
          id: p.id,
          name: p.name,
          slug: p.slug,
          productType: p.productType,
        })),
      }
    }

    return { clientRef: ref.clientRef, outcome: 'NO_MATCH' }
  })

  const resolved = resolutions.filter((r) => r.outcome === 'RESOLVED')
  const ambiguous = resolutions.filter((r) => r.outcome === 'AMBIGUOUS')
  const noMatch = resolutions.filter((r) => r.outcome === 'NO_MATCH')

  let topOutcome: 'SUCCESS' | 'NO_MATCH' | 'NEEDS_INPUT' = 'SUCCESS'
  let completeness: 'FULL' | 'PARTIAL' = 'FULL'

  if (ambiguous.length > 0) {
    topOutcome = 'NEEDS_INPUT'
  } else if (resolved.length === 0) {
    topOutcome = 'NO_MATCH'
  } else if (noMatch.length > 0) {
    topOutcome = 'SUCCESS'
    completeness = 'PARTIAL'
  }

  const evidence: EvidenceRecord[] = (resolved as Array<Extract<EntityResolutionV2, { outcome: 'RESOLVED' }>>).map((r) => ({
    evidenceId: `ev-identity-${r.entity.id}-${readAt}`,
    source: { system: 'SUPABASE', resource: 'products' },
    entity: { kind: 'PRODUCT', id: r.entity.id },
    facts: [
      { factRef: `fact-name-${r.entity.id}`, factPath: 'name', valueHash: r.entity.name },
      { factRef: `fact-slug-${r.entity.id}`, factPath: 'slug', valueHash: r.entity.slug },
    ],
    readAt,
  }))

  const observation: ToolObservationRefV2 = {
    observationId: `obs-${toolCallId}`,
    toolCallId,
    outcome: topOutcome,
    issueCodes: topOutcome === 'NO_MATCH' ? ['UNKNOWN_ENTITY_REFERENCE'] : [],
    inputHash: JSON.stringify(input),
    readAt,
  }

  if (topOutcome === 'NO_MATCH') {
    return {
      schemaVersion: '2.0',
      toolCallId,
      tool: 'resolve_catalog_entities',
      readAt,
      dataAsOf,
      evidence: [],
      observation,
      issues: [{
        code: 'UNKNOWN_ENTITY_REFERENCE',
        severity: 'WARNING',
        recovery: 'Kiểm tra lại tên xe hoặc hỏi người dùng muốn tìm dòng xe nào.',
        message: 'Không tìm thấy mẫu xe hoặc phụ kiện khớp với tên được cung cấp.',
      }],
      appliedBindings: [],
      outcome: 'NO_MATCH',
      data: { resolutions },
    }
  }

  if (topOutcome === 'NEEDS_INPUT') {
    return {
      schemaVersion: '2.0',
      toolCallId,
      tool: 'resolve_catalog_entities',
      readAt,
      dataAsOf,
      evidence,
      observation,
      issues: [{
        code: 'AMBIGUOUS_ENTITY_REFERENCE',
        severity: 'INFO',
        recovery: 'Gợi ý các mẫu xe tương ứng để người dùng lựa chọn.',
        message: 'Tìm thấy nhiều mẫu xe phù hợp.',
      }],
      appliedBindings: [],
      outcome: 'NEEDS_INPUT',
      data: { resolutions },
    }
  }

  return {
    schemaVersion: '2.0',
    toolCallId,
    tool: 'resolve_catalog_entities',
    readAt,
    dataAsOf,
    evidence,
    observation,
    issues: [],
    appliedBindings: [],
    outcome: 'SUCCESS',
    completeness,
    data: { resolutions },
  }
}
