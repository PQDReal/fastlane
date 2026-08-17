import { catalogCacheEngine } from '../cache/catalog-cache'
import { normalizeProductSearchText } from '@/lib/catalog/search'
import type {
  EvidenceRecord,
  ProductType,
  ResolveCatalogEntitiesInput,
  ResolveReference,
  ToolObservationRef,
  ToolResult,
} from '../contracts'
import { salesAgentProductUrl } from '../navigation/paths'

export type ResolvedEntity = {
  id: string
  kind: 'PRODUCT' | 'ACCESSORY_CATEGORY'
  productType: ProductType
  name: string
  slug: string
  url: string
  isActive: boolean
  sourceUpdatedAt: string | null
}

export type EntityResolution = {
  clientRef: string
  mention: string
} & (
  | { outcome: 'RESOLVED'; entity: ResolvedEntity; confidence: number; matchKind: 'NAME_EXACT' | 'SLUG_EXACT' | 'ALIAS_EXACT' | 'FUZZY' }
  | { outcome: 'AMBIGUOUS'; candidates: ResolvedEntity[]; ambiguityReason: 'MULTIPLE_CLOSE_MATCHES' }
  | { outcome: 'NO_MATCH'; candidates: ResolvedEntity[] }
)

export type ResolveCatalogEntitiesData = {
  resolutions: EntityResolution[]
}

export async function resolveCatalogEntitiesRepository(
  input: ResolveCatalogEntitiesInput,
  toolCallId: string = `call-resolve-${Date.now()}`,
): Promise<ToolResult<ResolveCatalogEntitiesData>> {
  const readAt = new Date().toISOString()
  const dataAsOf = readAt

  const snapshot = await catalogCacheEngine.getSnapshotAsync()
  const products = snapshot.products
  const resolutions: EntityResolution[] = []
  const evidence: EvidenceRecord[] = []
  const issues: any[] = []

  for (const ref of input.references) {
    const normMention = normalizeProductSearchText(ref.mention)
    const normMentionSlug = normMention.replace(/\s+/g, '-')

    let exactMatch = products.find((p) => normalizeProductSearchText(p.name) === normMention)
    let matchKind: 'NAME_EXACT' | 'SLUG_EXACT' | 'ALIAS_EXACT' | 'FUZZY' = 'NAME_EXACT'

    if (!exactMatch) {
      exactMatch = products.find((p) => p.slug === normMentionSlug || normalizeProductSearchText(p.slug) === normMentionSlug)
      if (exactMatch) matchKind = 'SLUG_EXACT'
    }

    if (!exactMatch) {
      exactMatch = products.find((p) => {
        const normName = normalizeProductSearchText(p.name)
        const shortName = normName.replace(/^vinfast\s+/, '')
        return shortName === normMention
      })
      if (exactMatch) matchKind = 'ALIAS_EXACT'
    }

    if (!exactMatch) {
      const candidates = products.filter((p) => {
        const normName = normalizeProductSearchText(p.name)
        const normSlug = normalizeProductSearchText(p.slug)
        return normName.includes(normMention) || normSlug.includes(normMentionSlug) || normMention.includes(normName)
      })

      if (candidates.length === 1) {
        exactMatch = candidates[0]
        matchKind = 'FUZZY'
      } else if (candidates.length > 1) {
        const resolvedCandidates: ResolvedEntity[] = candidates.map((c) => ({
          id: String(c.id),
          kind: 'PRODUCT',
          productType: c.productType,
          name: c.name,
          slug: c.slug,
          url: salesAgentProductUrl(c.productType as any, c.slug),
          isActive: true,
          sourceUpdatedAt: c.updatedAt,
        }))

        resolutions.push({
          clientRef: ref.clientRef,
          mention: ref.mention,
          outcome: 'AMBIGUOUS',
          candidates: resolvedCandidates,
          ambiguityReason: 'MULTIPLE_CLOSE_MATCHES',
        })
        issues.push({
          code: 'AMBIGUOUS_REFERENCE',
          message: `Từ khóa "${ref.mention}" khớp với nhiều sản phẩm.`,
          field: ref.clientRef,
          candidates: resolvedCandidates,
        })
        continue
      }
    }

    if (exactMatch) {
      const pType = exactMatch.productType
      const resolvedEntity: ResolvedEntity = {
        id: String(exactMatch.id),
        kind: 'PRODUCT',
        productType: pType,
        name: exactMatch.name,
        slug: exactMatch.slug,
        url: salesAgentProductUrl(pType as any, exactMatch.slug),
        isActive: true,
        sourceUpdatedAt: exactMatch.updatedAt,
      }

      resolutions.push({
        clientRef: ref.clientRef,
        mention: ref.mention,
        outcome: 'RESOLVED',
        entity: resolvedEntity,
        confidence: matchKind === 'NAME_EXACT' ? 1.0 : matchKind === 'ALIAS_EXACT' ? 0.95 : 0.85,
        matchKind,
      })

      evidence.push({
        evidenceId: `ev-identity-${exactMatch.id}-${readAt}`,
        source: { system: 'SUPABASE', resource: 'products' },
        entity: { kind: 'PRODUCT', id: String(exactMatch.id) },
        facts: [
          { factRef: `fact-identity-${exactMatch.id}`, factPath: 'identity.canonicalId', valueHash: String(exactMatch.id) },
          { factRef: `fact-name-${exactMatch.id}`, factPath: 'name', valueHash: exactMatch.name },
          { factRef: `fact-slug-${exactMatch.id}`, factPath: 'slug', valueHash: exactMatch.slug },
        ],
        readAt,
        sourceUpdatedAt: exactMatch.updatedAt ?? undefined,
      })
    } else {
      resolutions.push({
        clientRef: ref.clientRef,
        mention: ref.mention,
        outcome: 'NO_MATCH',
        candidates: [],
      })
      issues.push({
        code: 'UNKNOWN_ENTITY_REFERENCE',
        message: `Không tìm thấy sản phẩm khớp với "${ref.mention}".`,
        field: ref.clientRef,
      })
    }
  }

  const hasSuccess = resolutions.some((r) => r.outcome === 'RESOLVED')
  const hasAmbiguous = resolutions.some((r) => r.outcome === 'AMBIGUOUS')

  const observation: ToolObservationRef = {
    observationId: `obs-${toolCallId}`,
    toolCallId,
    outcome: hasSuccess ? 'SUCCESS' : hasAmbiguous ? 'NEEDS_INPUT' : 'NO_MATCH',
    issueCodes: issues.map((i) => i.code),
    inputHash: JSON.stringify(input),
    readAt,
  }

  if (!hasSuccess && hasAmbiguous) {
    return {
      schemaVersion: '2.0',
      toolCallId,
      tool: 'resolve_catalog_entities',
      readAt,
      dataAsOf,
      evidence: [],
      observation,
      issues,
      appliedBindings: [],
      outcome: 'NEEDS_INPUT',
      data: { resolutions },
    }
  }

  if (!hasSuccess) {
    return {
      schemaVersion: '2.0',
      toolCallId,
      tool: 'resolve_catalog_entities',
      readAt,
      dataAsOf,
      evidence: [],
      observation,
      issues,
      appliedBindings: [],
      outcome: 'NO_MATCH',
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
    issues,
    appliedBindings: [],
    outcome: 'SUCCESS',
    completeness: resolutions.every((r) => r.outcome === 'RESOLVED') ? 'FULL' : 'PARTIAL',
    data: { resolutions },
  }
}
