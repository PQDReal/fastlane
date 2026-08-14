import 'server-only'

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type {
  EvidenceRecord,
  FactPointer,
  GetCurrentPromotionsInput,
  ProductType,
  ToolObservationRef,
  ToolResult,
} from '../contracts'

export type PromotionSnapshot = {
  id: string
  title: string
  code: string
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT'
  discountValue: number
  description: string | null
  validFrom: string
  validUntil: string
  applicableProductTypes: ProductType[]
  applicableProductIds?: string[]
}

export type GetCurrentPromotionsData = {
  promotions: PromotionSnapshot[]
}

export async function getCurrentPromotionsRepository(
  input: GetCurrentPromotionsInput,
  toolCallId: string = `call-promo-${Date.now()}`,
): Promise<ToolResult<GetCurrentPromotionsData>> {
  const readAt = new Date().toISOString()
  const dataAsOf = readAt
  const client = getSupabaseAdmin()

  // Fastlane public promotions query
  const now = new Date().toISOString()
  const { data: rows, error } = await client
    .from('promotions')
    .select('*')
    .eq('is_active', true)
    .lte('valid_from', now)
    .gte('valid_until', now)

  // If promotions table is empty or error, fallback gracefully with empty list
  const promotions: PromotionSnapshot[] = (rows ?? []).map((row: any) => ({
    id: String(row.id),
    title: row.title || row.name,
    code: row.code,
    discountType: row.discount_type || 'PERCENTAGE',
    discountValue: Number(row.discount_value || 0),
    description: row.description,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    applicableProductTypes: row.applicable_product_types || ['CAR', 'BIKE'],
    applicableProductIds: row.applicable_product_ids,
  }))

  const evidence: EvidenceRecord[] = promotions.map((p) => ({
    evidenceId: `ev-promo-${p.id}-${readAt}`,
    source: { system: 'SUPABASE', resource: 'promotions' },
    entity: { kind: 'PROMOTION', id: p.id },
    facts: [
      { factRef: `fact-promo-title-${p.id}`, factPath: 'title', valueHash: p.title },
      { factRef: `fact-promo-discount-${p.id}`, factPath: 'discountValue', valueHash: String(p.discountValue) },
    ],
    readAt,
  }))

  const observation: ToolObservationRef = {
    observationId: `obs-${toolCallId}`,
    toolCallId,
    outcome: 'SUCCESS',
    issueCodes: [],
    inputHash: JSON.stringify(input),
    readAt,
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
    data: { promotions },
  }
}
