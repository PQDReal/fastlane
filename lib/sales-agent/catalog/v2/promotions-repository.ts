import 'server-only'

import { getCurrentSalesAgentPromotions, type SalesAgentPromotion } from '../promotions'
import type {
  EvidenceRecord,
  FactPointerV2,
  GetCurrentPromotionsInput,
  ProductTypeV2,
  ToolObservationRefV2,
  ToolResultV2,
} from '../../contracts/v2'

export type PromotionsResultDataV2 = {
  promotions: Array<{
    id: string
    code: string
    name: string
    description: string | null
    type: string
    value: number
    maxDiscountAmount: number | null
    applicableProductTypes: ProductTypeV2[]
    startsAt: string
    endsAt: string
  }>
  factPointers: FactPointerV2[]
}

export async function getCurrentPromotionsRepository(
  input: GetCurrentPromotionsInput,
  toolCallId: string,
): Promise<ToolResultV2<PromotionsResultDataV2>> {
  const readAt = new Date().toISOString()
  const dataAsOf = readAt
  const reqType = input.scope.kind === 'PRODUCT_TYPES' ? input.scope.productTypes[0] : undefined

  const promoResult = await getCurrentSalesAgentPromotions({
    productType: reqType as any,
  })

  const promotions = promoResult.items.map((p) => ({
    id: p.promotionId,
    code: p.code,
    name: p.name,
    description: p.description,
    type: p.type,
    value: p.value,
    maxDiscountAmount: p.maxDiscountAmount,
    applicableProductTypes: p.applicableProductTypes as ProductTypeV2[],
    startsAt: p.startsAt,
    endsAt: p.endsAt,
  }))

  const evidence: EvidenceRecord[] = promotions.map((p) => ({
    evidenceId: `ev-promo-${p.id}-${readAt}`,
    source: { system: 'SUPABASE', resource: 'promotions' },
    entity: { kind: 'PROMOTION', id: p.id },
    facts: [
      { factRef: `fact-promo-val-${p.id}`, factPath: 'value', valueHash: String(p.value) },
      { factRef: `fact-promo-name-${p.id}`, factPath: 'name', valueHash: p.name },
    ],
    readAt,
  }))

  const factPointers: FactPointerV2[] = promotions.map((p) => ({
    factRef: `fact-promo-val-${p.id}`,
    evidenceId: `ev-promo-${p.id}-${readAt}`,
    entityKind: 'PROMOTION',
    entityId: p.id,
    factPath: 'value',
  }))

  const observation: ToolObservationRefV2 = {
    observationId: `obs-${toolCallId}`,
    toolCallId,
    outcome: promotions.length > 0 ? 'SUCCESS' : 'NO_MATCH',
    issueCodes: [],
    inputHash: JSON.stringify(input),
    readAt,
  }

  if (promotions.length === 0) {
    return {
      schemaVersion: '2.0',
      toolCallId,
      tool: 'get_current_promotions',
      readAt,
      dataAsOf,
      evidence: [],
      observation,
      issues: [],
      appliedBindings: [],
      outcome: 'NO_MATCH',
      data: null,
    }
  }

  return {
    schemaVersion: '2.0',
    toolCallId,
    tool: 'get_current_promotions',
    readAt,
    dataAsOf,
    evidence,
    observation,
    issues: [],
    appliedBindings: [],
    outcome: 'SUCCESS',
    completeness: 'FULL',
    data: {
      promotions,
      factPointers,
    },
  }
}
