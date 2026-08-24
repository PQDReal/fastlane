import type {
  AssistantBlock,
  SalesAgentAction,
  SalesAgentSuggestion,
  TurnViewModel,
} from '../contracts'
import type { EvidenceLedger } from '../orchestrator/ledgers/evidence'
import type { KnownEntityLedger } from '../orchestrator/ledgers/known-entities'
import { resolveNavigationAction } from '../navigation/action-registry'
import { salesAgentProductUrl } from '../navigation/paths'
import { validateResponsePlan } from './plan-validator'

export type ComposeOptions = {
  rawPlan: unknown
  evidence: EvidenceLedger
  knownEntities: KnownEntityLedger
  conversationRef: string
  turnId: string
  messageId: string
  dataAsOf?: string
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
      markdownParts.push('*(Lưu ý: Một phần nguồn dữ liệu FASTLANE chưa trả về evidence phù hợp trong lượt này.)*')
    }
  }

  const finalMarkdown = markdownParts.join('\n\n') || 'Thông tin tư vấn từ Fastlane.'
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
  const knownProducts = options.knownEntities.getAllEntities().filter((e) => e.kind === 'PRODUCT')

  // Detect if this turn is a direct comparison between 2-3 specific products
  const isComparisonTurn =
    !isClarificationTurn &&
    knownProducts.length >= 2 &&
    knownProducts.length <= 3 &&
    (lowerMarkdown.includes('so sánh') ||
      plan.narrative.some((n) => n.kind === 'ADVICE' && n.markdown.toLowerCase().includes('so sánh')))

  // Only render product blocks if NOT a clarification turn and products exist
  if (!isClarificationTurn && knownProducts.length > 0) {
    if (isComparisonTurn) {
      // Comparison Turn: Render ONLY the side-by-side COMPARISON_TABLE to avoid duplicate images
      const criteria = ['Giá khởi điểm', 'Dung lượng pin', 'Quãng đường', 'Công suất', 'Số chỗ ngồi']
      const compProducts = knownProducts.map((entity) => {
        const factPrice = options.evidence.getFact(`fact-price-${entity.id}`)
        const factSlug = options.evidence.getFact(`fact-slug-${entity.id}`)
        const slug = entity.slug || (factSlug ? factSlug.valueHash : entity.name.toLowerCase().replace(/\s+/g, '-'))
        const pType = entity.productType || 'CAR'
        const factPriceVal = (entity.price != null || factPrice)
          ? `${(entity.price ?? Number(factPrice?.valueHash)).toLocaleString('vi-VN')} VNĐ`
          : 'Liên hệ'

        return {
          productId: entity.id,
          name: entity.name,
          thumbnailUrl: entity.thumbnailUrl || null,
          url: salesAgentProductUrl(pType as any, slug),
          values: {
            'Giá khởi điểm': factPriceVal,
          },
        }
      })

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
        modelId: modelIdFact.valueHash
      })
    }
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
  const successfulToolNames = new Set(
    options.evidence.getAllToolResults()
      .filter((result) => result.outcome === 'SUCCESS')
      .map((result) => result.tool),
  )
  const officialManualLabel = allFacts.find((fact) => fact.factPath === 'official_document_label')?.valueHash
  const manualModelId = allFacts.find((fact) => fact.factPath === 'model_id')?.valueHash
  const manualContextLabel = officialManualLabel?.replace(/^HDSD xe\s+/i, '').trim()
    || manualModelId?.replace(/_20\d{2}$/, '').trim()

  if (suggestions.length === 0) {
    if (successfulToolNames.has('search_user_manuals') && manualContextLabel) {
      suggestions.push(
        {
          suggestionId: `sug-1-${options.turnId}`,
          label: `Chính sách bảo hành ${manualContextLabel}`,
          payload: `Chính sách bảo hành ${manualContextLabel}`,
        },
        {
          suggestionId: `sug-2-${options.turnId}`,
          label: 'Tìm xưởng dịch vụ',
          payload: `Tìm xưởng dịch vụ cho ${manualContextLabel}`,
        },
      )
    } else if (isClarificationTurn) {
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

  const negativeObservations = options.evidence.getAllObservations().filter((observation) => (
    observation.outcome === 'NO_MATCH'
    || observation.outcome === 'REJECTED'
    || observation.outcome === 'UNAVAILABLE'
  ))
  const hasFacts = options.evidence.getAllFacts().length > 0
  const hasPartialToolResult = options.evidence.getAllToolResults().some((result) => (
    result.outcome === 'SUCCESS' && result.completeness === 'PARTIAL'
  ))
  const completeness = negativeObservations.length > 0
    ? hasFacts ? 'PARTIAL' : 'NO_EVIDENCE'
    : hasPartialToolResult
      ? 'PARTIAL'
      : plan.outcome === 'ANSWER'
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
