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
      markdownParts.push('*(Lưu ý: Một số thông tin chưa được tìm thấy trong catalog hiện tại)*')
    }
  }

  const finalMarkdown = markdownParts.join('\n\n') || 'Thông tin tư vấn từ Fastlane.'

  // 2. Materialize Blocks from Ledgers and Known Entities
  const blocks: AssistantBlock[] = []
  const knownProducts = options.knownEntities.getAllEntities().filter((e) => e.kind === 'PRODUCT')

  if (knownProducts.length > 0) {
    const productItems = knownProducts.slice(0, 6).map((entity) => {
      const factPrice = options.evidence.getFact(`fact-price-${entity.id}`)
      const factSlug = options.evidence.getFact(`fact-slug-${entity.id}`)
      const priceNum = factPrice ? Number(factPrice.valueHash) : null
      const slug = factSlug ? factSlug.valueHash : entity.name.toLowerCase().replace(/\s+/g, '-')
      const pType = entity.productType || 'CAR'

      return {
        id: entity.id,
        name: entity.name,
        slug,
        productType: pType,
        price: !isNaN(Number(priceNum)) && priceNum ? priceNum : null,
        url: salesAgentProductUrl(pType as any, slug),
      }
    })

    blocks.push({
      kind: 'PRODUCT_LIST',
      title: knownProducts.length > 1 ? 'Danh sách sản phẩm liên quan' : 'Chi tiết sản phẩm',
      items: productItems,
    })

    // If 2 or more products are being discussed in detail, also add comparison card view
    if (knownProducts.length >= 2 && knownProducts.length <= 3) {
      const criteria = ['Giá khởi điểm', 'Dung lượng pin', 'Quãng đường', 'Công suất', 'Số chỗ ngồi']
      const compProducts = knownProducts.map((entity) => {
        const factPrice = options.evidence.getFact(`fact-price-${entity.id}`)
        const factPriceVal = factPrice ? `${Number(factPrice.valueHash).toLocaleString('vi-VN')} VNĐ` : 'Liên hệ'

        return {
          productId: entity.id,
          name: entity.name,
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
    }
  }

  // 3. Compose Actions
  const actions: SalesAgentAction[] = plan.actionIntents.map((intent) =>
    resolveNavigationAction(intent),
  )

  if (actions.length === 0 && knownProducts.length === 1) {
    actions.push(
      resolveNavigationAction({
        actionKey: 'VIEW_PRODUCT',
        entityId: knownProducts[0].id,
      }),
    )
  }

  // 4. Compose Suggestions
  const suggestions: SalesAgentSuggestion[] = plan.suggestionIntents.map((sug, idx) => ({
    suggestionId: `sug-${idx + 1}-${options.turnId}`,
    label: sug.text,
    payload: sug.text,
  }))

  // Smart ambient suggestions based on known entities
  if (suggestions.length === 0) {
    if (knownProducts.length >= 2) {
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
        { suggestionId: `sug-1-${options.turnId}`, label: 'Giá xe hiện tại', payload: 'Giá xe hiện tại' },
        { suggestionId: `sug-2-${options.turnId}`, label: 'So sánh VF 8 và VF 9', payload: 'So sánh VF 8 và VF 9' },
        { suggestionId: `sug-3-${options.turnId}`, label: 'Chính sách bảo hành pin', payload: 'Chính sách bảo hành pin' },
        { suggestionId: `sug-4-${options.turnId}`, label: 'Phụ kiện nên mua', payload: 'Phụ kiện nên mua' },
      )
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
