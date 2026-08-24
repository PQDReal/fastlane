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

export type ComposeOptions = {
  rawPlan: unknown
  evidence: EvidenceLedger
  knownEntities: KnownEntityLedger
  conversationRef: string
  turnId: string
  messageId: string
  dataAsOf?: string
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

  // Detect Clarification / Needs Input turn (e.g. asking user which models to compare)
  const isClarificationTurn =
    plan.outcome === 'NEEDS_INPUT' ||
    finalMarkdown.includes('Bạn muốn so sánh') ||
    finalMarkdown.includes('những mẫu nào') ||
    finalMarkdown.includes('quan tâm ô tô hay xe máy') ||
    finalMarkdown.includes('gửi tên 2-3 mẫu xe') ||
    finalMarkdown.includes('Bạn đang quan tâm mẫu nào')

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
      // Non-Comparison Turn: Render PRODUCT_LIST cards
      const cars = knownProducts.filter((p) => p.productType === 'CAR')
      const bikes = knownProducts.filter((p) => p.productType === 'BIKE')
      const accessories = knownProducts.filter((p) => p.productType === 'ACCESSORY')

      let selectedProducts: typeof knownProducts = []
      let blockTitle = 'Danh sách sản phẩm liên quan'

      const mentionsCar = lowerMarkdown.includes('ô tô') || lowerMarkdown.includes('vf ') || lowerMarkdown.includes('suv')
      const mentionsBike = lowerMarkdown.includes('xe máy') || lowerMarkdown.includes('evo') || lowerMarkdown.includes('feliz') || lowerMarkdown.includes('amio')

      if (mentionsCar && !mentionsBike && cars.length > 0) {
        selectedProducts = cars.slice(0, 8)
        blockTitle = 'Các dòng ô tô điện VinFast'
      } else if (mentionsBike && !mentionsCar && bikes.length > 0) {
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

  const allFacts = options.evidence.getAllFacts()

  // 2.5 Extract User Manual Images from Evidence
  const imageFacts = allFacts.filter((f) => f.factPath === 'image_url' && f.valueHash)
  
  if (imageFacts.length > 0) {
    // We NO LONGER auto-push the first image. The AI is now instructed to use Markdown `![alt](url)`
    // to render the most relevant image based on context.
  }

  // 2.6 Extract User Manual Article References from Evidence
  const articleFacts = allFacts.filter((f) => f.factPath === 'article_id' && f.valueHash)
  if (articleFacts.length > 0) {
    const firstArticleId = articleFacts[0].valueHash
    // Find the corresponding model_id using the chunkId (which is in the factRef)
    const chunkId = articleFacts[0].factRef.replace('fact-manual-articleId-', '')
    const modelIdFact = allFacts.find((f) => f.factRef === `fact-manual-modelId-${chunkId}`)
    
    if (firstArticleId && modelIdFact && modelIdFact.valueHash) {
      blocks.push({
        kind: 'MANUAL_REFERENCE',
        articleId: firstArticleId,
        modelId: modelIdFact.valueHash,
      })
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
  const suggestions: SalesAgentSuggestion[] = plan.suggestionIntents.map((sug, idx) => ({
    suggestionId: `sug-${idx + 1}-${options.turnId}`,
    label: sug.text,
    payload: sug.payload || sug.text,
  }))

  // Smart contextual ambient suggestions
  if (suggestions.length === 0) {
    if (isClarificationTurn) {
      const isComparing = lowerMarkdown.includes('so sánh') || lowerMarkdown.includes('pin') || lowerMarkdown.includes('tốc độ')
      if (isComparing) {
        suggestions.push(
          { suggestionId: `sug-1-${options.turnId}`, label: 'VF 8 vs VF 9', payload: 'So sánh VF 8 và VF 9' },
          { suggestionId: `sug-2-${options.turnId}`, label: 'VF 3 vs VF 5', payload: 'So sánh VF 3 và VF 5' },
          { suggestionId: `sug-3-${options.turnId}`, label: 'VF 6 vs VF 7', payload: 'So sánh VF 6 và VF 7' },
          { suggestionId: `sug-4-${options.turnId}`, label: 'Evo 200 vs Feliz', payload: 'So sánh Feliz 2025 và Flazz' },
        )
      } else {
        suggestions.push(
          { suggestionId: `sug-1-${options.turnId}`, label: 'Xem các mẫu ô tô điện', payload: 'có những ô tô nào' },
          { suggestionId: `sug-2-${options.turnId}`, label: 'Xem các mẫu xe máy điện', payload: 'xe máy điện' },
          { suggestionId: `sug-3-${options.turnId}`, label: 'Ô tô dưới 500 triệu', payload: 'Tư vấn ô tô dưới 500 triệu' },
          { suggestionId: `sug-4-${options.turnId}`, label: 'Xe máy dưới 20 triệu', payload: 'Tư vấn xe máy điện dưới 20 triệu' },
        )
      }
    } else {
      const cars = knownProducts.filter((p) => p.productType === 'CAR')
      const bikes = knownProducts.filter((p) => p.productType === 'BIKE')

      if (cars.length > 0 && bikes.length > 0) {
        suggestions.push(
          { suggestionId: `sug-1-${options.turnId}`, label: 'Xem các mẫu ô tô điện', payload: 'có những ô tô nào' },
          { suggestionId: `sug-2-${options.turnId}`, label: 'Xem các mẫu xe máy điện', payload: 'xe máy điện' },
          { suggestionId: `sug-3-${options.turnId}`, label: 'Tư vấn mua xe trả góp', payload: 'Dự toán trả góp' },
          { suggestionId: `sug-4-${options.turnId}`, label: 'Chính sách bảo hành pin', payload: 'Chính sách bảo hành pin' },
        )
      } else if (knownProducts.length >= 2) {
        suggestions.push(
          { suggestionId: `sug-1-${options.turnId}`, label: `Dự toán trả góp ${knownProducts[0].name}`, payload: `Dự toán trả góp ${knownProducts[0].name}` },
          { suggestionId: `sug-2-${options.turnId}`, label: `Đặt lịch lái thử ${knownProducts[0].name}`, payload: `Đặt lịch lái thử ${knownProducts[0].name}` },
          { suggestionId: `sug-3-${options.turnId}`, label: `Phụ kiện ${knownProducts[0].name}`, payload: `Phụ kiện cho ${knownProducts[0].name}` },
        )
      } else if (knownProducts.length === 1) {
        suggestions.push(
          { suggestionId: `sug-1-${options.turnId}`, label: `Thông số ${knownProducts[0].name}`, payload: `Thông số kỹ thuật ${knownProducts[0].name}` },
          { suggestionId: `sug-2-${options.turnId}`, label: 'Dự toán trả góp', payload: `Dự toán trả góp ${knownProducts[0].name}` },
          { suggestionId: `sug-3-${options.turnId}`, label: 'Đặt lịch lái thử', payload: `Đặt lịch lái thử ${knownProducts[0].name}` },
          { suggestionId: `sug-4-${options.turnId}`, label: 'Phụ kiện phù hợp', payload: `Phụ kiện phù hợp cho ${knownProducts[0].name}` },
        )
      } else {
        suggestions.push(
          { suggestionId: `sug-1-${options.turnId}`, label: 'Xem các dòng xe VinFast', payload: 'Các dòng xe VinFast hiện nay' },
          { suggestionId: `sug-2-${options.turnId}`, label: 'Dự toán trả góp', payload: 'Tư vấn mua xe trả góp' },
          { suggestionId: `sug-3-${options.turnId}`, label: 'Chính sách bảo hành pin', payload: 'Chính sách bảo hành pin' },
          { suggestionId: `sug-4-${options.turnId}`, label: 'Phụ kiện nổi bật', payload: 'Phụ kiện xe VinFast' },
        )
      }
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
    suggestions: suggestions.slice(0, 4),
    grounding: {
      dataAsOf: options.dataAsOf || new Date().toISOString(),
      warnings,
    },
  }
}
