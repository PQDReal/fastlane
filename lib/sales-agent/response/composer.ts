import type {
  AssistantBlock,
  SalesAgentAction,
  SalesAgentSuggestion,
  TurnViewModel,
} from '../contracts'
import type { EvidenceLedger } from '../orchestrator/ledgers/evidence'
import type { KnownEntityLedger } from '../orchestrator/ledgers/known-entities'
import { resolveNavigationAction } from '../navigation/action-registry'
import { sanitizeSalesAgentMarkdownLinks } from '../navigation/markdown-links'
import { salesAgentProductUrl } from '../navigation/paths'
import { validateResponsePlan } from './plan-validator'
import { isAllowedKnowledgeMediaUrl } from '../knowledge/media-url'
import { knowledgeMediaMarker, knowledgeMediaReference } from '../knowledge/media-reference'
import { buildSuggestionCandidates, rankSuggestionCandidates, type SuggestionProduct } from '../suggestions/candidates'

export type ComposeOptions = {
  rawPlan: unknown
  evidence: EvidenceLedger
  knownEntities: KnownEntityLedger
  conversationRef: string
  turnId: string
  messageId: string
  dataAsOf?: string
  /** Current catalog names used only to seed contextual suggestion chips. */
  catalogProductNames?: string[]
  /** Active catalog slice used to validate entity-backed suggestions. */
  catalogProducts?: SuggestionProduct[]
  catalogStatus?: 'SYNCED' | 'INDEX_ONLY' | 'UNAVAILABLE'
  catalogVersion?: number
}

type KnowledgeMediaItem = Extract<AssistantBlock, { kind: 'KNOWLEDGE_MEDIA' }>['items'][number]

function parseKnowledgeMediaPointer(value: string): KnowledgeMediaItem | null {
  try {
    const candidate = JSON.parse(value) as Record<string, unknown>
    const url = String(candidate.url || '')
    if (!isAllowedKnowledgeMediaUrl(url)) return null
    const required = ['assetId', 'annotationId', 'title', 'summary', 'alt', 'mimeType', 'citationId']
    if (required.some((key) => typeof candidate[key] !== 'string' || !String(candidate[key]).trim())) {
      return null
    }
    return {
      assetId: String(candidate.assetId),
      annotationId: String(candidate.annotationId),
      title: String(candidate.title),
      summary: String(candidate.summary),
      alt: String(candidate.alt),
      url,
      mimeType: String(candidate.mimeType),
      width: candidate.width == null ? null : Number(candidate.width),
      height: candidate.height == null ? null : Number(candidate.height),
      safetyCritical: candidate.safetyCritical === true,
      citationId: String(candidate.citationId),
      diagramLabels: Array.isArray(candidate.diagramLabels)
        ? candidate.diagramLabels.flatMap((label) => {
            if (!label || typeof label !== 'object') return []
            const row = label as Record<string, unknown>
            const marker = typeof row.marker === 'string' ? row.marker.trim() : ''
            const description = typeof row.description === 'string' ? row.description.trim() : ''
            return marker && description ? [{ marker, description }] : []
          }).slice(0, 30)
        : [],
    }
  } catch {
    return null
  }
}

type ComparisonData = {
  products: Array<{
    productId: string
    name: string
    thumbnailUrl: string | null
    url?: string
  }>
  rows: Array<{
    label: string
    values: Array<{ productId: string; value: string }>
  }>
}

function readComparisonData(evidence: EvidenceLedger): ComparisonData | null {
  const result = evidence.getLatestToolResult('compare_products')
  if (!result || result.outcome !== 'SUCCESS' || !result.data || typeof result.data !== 'object') return null
  const data = result.data as Partial<ComparisonData>
  if (!Array.isArray(data.products) || data.products.length < 2 || !Array.isArray(data.rows)) return null
  return data as ComparisonData
}

function markerAppears(markdown: string, marker: string) {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:\\(${escaped}\\)|(?:^|\\n)\\s*${escaped}[.)])`, 'u').test(markdown)
}

function diagramLegendMarkdown(item: KnowledgeMediaItem) {
  if (!item.diagramLabels?.length) return ''
  return [
    `**Chú giải — ${item.title}**`,
    ...item.diagramLabels.map((label) => `- **(${label.marker})** ${label.description}`),
  ].join('\n')
}

function mediaIsReferenced(markdown: string, item: KnowledgeMediaItem) {
  if (item.reference && markdown.includes(knowledgeMediaMarker(item.reference))) return true
  if (markdown.includes(item.url)) return true
  const filename = item.url.split(/[?#]/, 1)[0]?.split('/').pop()
  return Boolean(filename && markdown.toLowerCase().includes(filename.toLowerCase()))
}

function compactKnowledgeMediaReferences(markdown: string, media: KnowledgeMediaItem[]) {
  let result = markdown
  for (const item of media) {
    if (!item.reference) continue
    const escapedUrl = item.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(
      new RegExp(`!\\[[^\\]]*\\]\\(${escapedUrl}\\)`, 'g'),
      knowledgeMediaMarker(item.reference),
    )
  }

  return result.replace(/\[media:\s*(\d+)\]/gi, (marker, rawPosition: string) => {
    const reference = knowledgeMediaReference(Number(rawPosition))
    return media.some((item) => item.reference === reference)
      ? knowledgeMediaMarker(reference)
      : ''
  })
}

function attachReferencedDiagramLegends(markdown: string, media: KnowledgeMediaItem[]) {
  let result = markdown
  for (const item of media) {
    if (!item.diagramLabels?.length) continue
    const needsLegend = !item.diagramLabels.every((label) => markerAppears(result, label.marker))
    if (needsLegend) result = `${result}\n\n${diagramLegendMarkdown(item)}`
  }
  return result
}

export function composeTurnResponse(options: ComposeOptions): TurnViewModel {
  const { plan, warnings } = validateResponsePlan(
    options.rawPlan,
    options.evidence,
    options.knownEntities,
  )

  // 1. Compose Narrative Markdown
  const markdownParts: string[] = []

  for (const item of plan.narrative) {
    if (item.kind === 'ADVICE') {
      markdownParts.push(item.markdown)
    } else if (item.kind === 'LIMITATION') {
      markdownParts.push('*(Lưu ý: Một số thông tin chưa được tìm thấy trong catalog hiện tại)*')
    }
  }

  const knownProducts = options.knownEntities.getAllEntities().filter((e) => e.kind === 'PRODUCT')
  const catalogSuggestionProducts = options.catalogStatus === 'INDEX_ONLY'
    ? []
    : (options.catalogProducts ?? options.catalogProductNames?.map((name) => ({ name })) ?? [])
  const seenKnowledgeMedia = new Set<string>()
  const availableKnowledgeMedia = options.evidence.getAllFacts()
    .filter((fact) => fact.factPath === 'mediaPointer')
    .flatMap((fact) => {
      const pointer = parseKnowledgeMediaPointer(fact.valueHash)
      if (!pointer || seenKnowledgeMedia.has(pointer.assetId)) return []
      seenKnowledgeMedia.add(pointer.assetId)
      return [pointer]
    })
  const availableIndexedKnowledgeMedia = availableKnowledgeMedia.map((item, index) => ({
    ...item,
    reference: knowledgeMediaReference(index + 1),
  }))
  const sanitizedMarkdown = sanitizeSalesAgentMarkdownLinks(
    markdownParts.join('\n\n') || 'Thông tin tư vấn từ Fastlane.',
    knownProducts,
  )
  const compactMarkdown = compactKnowledgeMediaReferences(
    sanitizedMarkdown,
    availableIndexedKnowledgeMedia,
  )
  const knowledgeMedia = availableIndexedKnowledgeMedia
    .filter((item) => mediaIsReferenced(compactMarkdown, item))
    .slice(0, 3)
  const finalMarkdown = attachReferencedDiagramLegends(compactMarkdown, knowledgeMedia)
  const lowerMarkdown = finalMarkdown.toLowerCase()

  // Detect Clarification / Needs Input turn strictly from plan and observation outcomes
  const isClarificationTurn =
    plan.outcome === 'NEEDS_INPUT' ||
    options.evidence.getAllObservations().some((observation) => observation.outcome === 'NEEDS_INPUT')

  // 2. Materialize Blocks from Ledgers and Known Entities (Intent-Gated)
  const blocks: AssistantBlock[] = []
  // Detect if this turn is a direct comparison between 2-3 specific products
  const comparisonData = readComparisonData(options.evidence)
  const isComparisonTurn = !isClarificationTurn && Boolean(comparisonData)

  // Only render product blocks if NOT a clarification turn and products exist
  if (!isClarificationTurn && knownProducts.length > 0) {
    if (isComparisonTurn) {
      // Use the canonical comparison rows returned by the repository verbatim.
      const criteria = comparisonData!.rows.map((row) => row.label)
      const compProducts = comparisonData!.products.map((product) => ({
        productId: product.productId,
        name: product.name,
        thumbnailUrl: product.thumbnailUrl,
        url: product.url,
        values: Object.fromEntries(comparisonData!.rows.map((row) => [
          row.label,
          row.values.find((value) => value.productId === product.productId)?.value || 'Chưa cập nhật',
        ])),
      }))

      blocks.push({
        kind: 'COMPARISON_TABLE',
        criteria,
        products: compProducts,
      })
    } else {
      // Non-Comparison Turn: Render PRODUCT_LIST cards strictly based on typed entities
      const cars = knownProducts.filter((p) => p.productType === 'CAR')
      const bikes = knownProducts.filter((p) => p.productType === 'BIKE')
      const accessories = knownProducts.filter((p) => p.productType === 'ACCESSORY')

      let selectedProducts: typeof knownProducts = []
      let blockTitle = 'Danh sách sản phẩm liên quan'

      if (cars.length > 0 && bikes.length === 0) {
        selectedProducts = cars.slice(0, 8)
        blockTitle = 'Các dòng ô tô điện VinFast'
      } else if (bikes.length > 0 && cars.length === 0) {
        selectedProducts = bikes.slice(0, 8)
        blockTitle = 'Các dòng xe máy điện VinFast'
      } else if (cars.length > 0 && bikes.length > 0) {
        selectedProducts = [...cars.slice(0, 4), ...bikes.slice(0, 4)]
        blockTitle = 'Mẫu xe nổi bật (Ô tô & Xe máy điện)'
      } else if (accessories.length > 0) {
        selectedProducts = accessories.slice(0, 8)
        blockTitle = 'Phụ kiện chính hãng'
      } else {
        selectedProducts = knownProducts.slice(0, 8)
        blockTitle = 'Sản phẩm liên quan'
      }

      if (selectedProducts.length > 0) {
        const productItems = selectedProducts.map((entity) => {
          const factPrice = options.evidence.getFact(`fact-price-${entity.id}`)
          const factSlug = options.evidence.getFact(`fact-slug-${entity.id}`)
          const priceNum = entity.price ?? (factPrice ? Number(factPrice.valueHash) : null)
          const slug = entity.slug || (factSlug ? factSlug.valueHash : entity.name.toLowerCase().replace(/\s+/g, '-'))
          const pType = entity.productType || 'CAR'

          return {
            id: entity.id,
            name: entity.name,
            slug,
            productType: pType,
            thumbnailUrl: entity.thumbnailUrl || null,
            price: !isNaN(Number(priceNum)) && priceNum ? priceNum : null,
            summary: entity.summary || null,
            url: salesAgentProductUrl(pType as any, slug),
          }
        })

        blocks.push({
          kind: 'PRODUCT_LIST',
          title: blockTitle,
          items: productItems,
        })
      }
    }
  }

  // Materialize Knowledge Citation references if available (A19-KR-408)
  const knowledgeEvidence = options.evidence.getAllEvidence().filter((e) => e.entity.kind === 'KNOWLEDGE_SNIPPET')
  if (knowledgeEvidence.length > 0) {
    const citationFacts = knowledgeEvidence.slice(0, 3).map((e, idx) => {
      const titleFact = options.evidence.getFact(`fact-kb-title-${e.entity.id}`)?.valueHash || 'Tài liệu hướng dẫn'
      const secFact = options.evidence.getFact(`fact-kb-section-${e.entity.id}`)?.valueHash || 'Chi tiết'
      const citationId = options.evidence.getFact(`fact-kb-citation-${e.entity.id}`)?.valueHash
      return {
        ...(citationId ? { citationId } : {}),
        label: `Nguồn tham chiếu [${idx + 1}]`,
        value: `${titleFact} — ${secFact}`,
      }
    })
    if (citationFacts.length > 0) {
      blocks.push({
        kind: 'FACT_SUMMARY',
        facts: citationFacts,
      })
    }
  }

  if (knowledgeMedia.length > 0) {
    blocks.push({
      kind: 'KNOWLEDGE_MEDIA',
      title: 'Hình hướng dẫn liên quan',
      items: knowledgeMedia,
    })
  }

  // 3. Compose Actions (only include global actions or navigation if blocks are not already showing cards)
  const actions: SalesAgentAction[] = plan.actionIntents
    .filter((intent) => intent.actionKey !== 'VIEW_PRODUCT' || blocks.length === 0)
    .map((intent) => {
      const entity = intent.entityId ? options.knownEntities.getEntity('PRODUCT', intent.entityId) : undefined
      const slug = entity?.slug || (entity ? options.evidence.getFact(`fact-slug-${entity.id}`)?.valueHash : undefined)
      return resolveNavigationAction(intent, slug)
    })

  // 4. Compose Suggestions (Context-Aware)
  const suggestions: SalesAgentSuggestion[] = plan.suggestionIntents.slice(0, 3).map((sug, idx) => ({
    suggestionId: `sug-${idx + 1}-${options.turnId}`,
    label: sug.text,
    payload: sug.text,
    kind: sug.category === 'CLARIFICATION' ? 'CLARIFICATION' : sug.category === 'ALTERNATIVE' ? 'CATALOG_COMPARE' : 'FOLLOW_UP',
    ...(sug.targetEntityId ? { entityIds: [sug.targetEntityId] } : {}),
    ...(options.catalogVersion ? { catalogVersion: options.catalogVersion } : {}),
  }))

  if (suggestions.length === 0) {
    const hasWarrantyOrBatteryPolicy = knowledgeEvidence.some((e) => {
      const cat = options.evidence.getFact(`fact-kb-category-${e.entity.id}`)?.valueHash
      return cat === 'WARRANTY_BATTERY' || cat === 'WARRANTY_POLICY' || cat === 'BATTERY_POLICY'
    })

    const candidates = buildSuggestionCandidates({
      knownProducts: knownProducts.map((product) => ({
        id: product.id,
        name: product.name,
        productType: product.productType,
      })),
      catalogProducts: catalogSuggestionProducts,
      isClarificationTurn,
      isComparisonTurn,
      hasWarrantyOrBatteryPolicy,
    })

    for (const candidate of rankSuggestionCandidates(candidates, 3)) {
      suggestions.push({
        suggestionId: `sug-${suggestions.length + 1}-${options.turnId}`,
        label: candidate.label,
        payload: candidate.payload,
        kind: candidate.kind,
        ...(candidate.entityIds?.length ? { entityIds: candidate.entityIds } : {}),
        ...(candidate.entityType ? { entityType: candidate.entityType } : {}),
        ...(options.catalogVersion ? { catalogVersion: options.catalogVersion } : {}),
      })
    }
  }

  const completeness = plan.outcome === 'ANSWER'
    ? 'COMPLETE'
    : plan.outcome === 'DEGRADED'
      ? 'NO_EVIDENCE'
      : 'PARTIAL'

  return {
    schemaVersion: '2.0',
    conversationRef: options.conversationRef,
    turnId: options.turnId,
    messageId: options.messageId,
    answer: {
      markdown: finalMarkdown,
      completeness,
    },
    blocks,
    actions,
    suggestions: suggestions.slice(0, 3),
    grounding: {
      dataAsOf: options.dataAsOf || new Date().toISOString(),
      warnings,
    },
  }
}
