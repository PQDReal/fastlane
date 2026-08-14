import type {
  AssistantBlockV2,
  SalesAgentActionV2,
  SalesAgentSuggestionV2,
  TurnViewModelV2,
} from '../../contracts/v2'
import type { EvidenceLedger } from '../../orchestrator/v2/ledgers/evidence'
import type { KnownEntityLedger } from '../../orchestrator/v2/ledgers/known-entities'
import { resolveNavigationAction } from '../../navigation/v2/action-registry'
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

export function composeTurnResponse(options: ComposeOptions): TurnViewModelV2 {
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

  // 2. Materialize Blocks from Ledgers and Tool Results
  const blocks: AssistantBlockV2[] = []
  const allEvidence = options.evidence.getAllEvidence()

  for (const ev of allEvidence) {
    // Check for product browse
    if (ev.source.resource === 'products' && ev.entity.kind === 'PRODUCT') {
      const factPrice = options.evidence.getFact(`fact-price-${ev.entity.id}`)
      const factName = options.evidence.getFact(`fact-name-${ev.entity.id}`)
      const factSlug = options.evidence.getFact(`fact-slug-${ev.entity.id}`)

      if (factName && factPrice) {
        // Individual product details or part of list
      }
    }
  }

  // 3. Compose Actions
  const actions: SalesAgentActionV2[] = plan.actionIntents.map((intent) =>
    resolveNavigationAction(intent),
  )

  // If no action and we have known products, add a primary view product action
  const knownProducts = options.knownEntities.getAllEntities().filter((e) => e.kind === 'PRODUCT')
  if (actions.length === 0 && knownProducts.length === 1) {
    actions.push(
      resolveNavigationAction({
        actionKey: 'VIEW_PRODUCT',
        entityId: knownProducts[0].id,
      }),
    )
  }

  // 4. Compose Suggestions
  const suggestions: SalesAgentSuggestionV2[] = plan.suggestionIntents.map((sug, idx) => ({
    suggestionId: `sug-${idx + 1}-${options.turnId}`,
    label: sug.text,
    payload: sug.text,
  }))

  // Add default helpful suggestions if none provided
  if (suggestions.length === 0) {
    suggestions.push(
      { suggestionId: `sug-1-${options.turnId}`, label: 'Giá xe hiện tại', payload: 'Giá xe hiện tại' },
      { suggestionId: `sug-2-${options.turnId}`, label: 'So sánh VF 8 và VF 9', payload: 'So sánh VF 8 và VF 9' },
      { suggestionId: `sug-3-${options.turnId}`, label: 'Chính sách bảo hành pin', payload: 'Chính sách bảo hành pin' },
    )
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
