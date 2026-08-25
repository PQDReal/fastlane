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
  const queryStartedAt = Date.now()

  let rows: any[] | null = null
  let queryError: { name: string; message: string } | undefined
  try {
    const now = new Date().toISOString()
    const timeoutPromise = new Promise<{ data: null; error: Error }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: new Error('Promotions fetch timeout') }), 2500),
    )
    const fetchPromise = client
      .from('promotions')
      .select('*')
      .eq('is_active', true)
      .or(`starts_at.is.null,starts_at.lte.${now}`)
      .or(`ends_at.is.null,ends_at.gte.${now}`)

    const res = await Promise.race([fetchPromise, timeoutPromise])
    if (res.error) {
      queryError = { name: 'PromotionsQueryError', message: res.error.message || String(res.error) }
    } else if (res.data && Array.isArray(res.data)) {
      rows = res.data
    }
  } catch (err) {
    console.warn('[PROMOTIONS_REPO] Supabase promotions query failed:', err)
    queryError = err instanceof Error
      ? { name: err.name, message: err.message }
      : { name: 'UNKNOWN_ERROR', message: String(err) }
  }

  const promotions: PromotionSnapshot[] = (rows ?? []).map((row: any) => ({
    id: String(row.id),
    title: row.title || row.name || `Ưu đãi ${row.code}`,
    code: row.code,
    discountType: (row.type === 'FIXED' || row.discount_type === 'FIXED_AMOUNT') ? 'FIXED_AMOUNT' : 'PERCENTAGE',
    discountValue: Number(row.value ?? row.discount_value ?? 0),
    description: row.description || (row.max_discount_amount ? `Giảm tối đa ${Number(row.max_discount_amount).toLocaleString('vi-VN')} VNĐ` : null),
    validFrom: row.starts_at || row.valid_from || readAt,
    validUntil: row.ends_at || row.valid_until || readAt,
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
      { factRef: `fact-promo-code-${p.id}`, factPath: 'code', valueHash: p.code },
    ],
    readAt,
  }))

  const observation: ToolObservationRef = {
    observationId: `obs-${toolCallId}`,
    toolCallId,
    outcome: queryError ? 'UNAVAILABLE' : (promotions.length > 0 ? 'SUCCESS' : 'NO_MATCH'),
    issueCodes: queryError ? ['RESOURCE_UNAVAILABLE'] : [],
    inputHash: JSON.stringify(input),
    readAt,
  }

  if (queryError) {
    return {
      schemaVersion: '2.0',
      toolCallId,
      tool: 'get_current_promotions',
      readAt,
      dataAsOf,
      evidence,
      observation,
      issues: [{ code: 'RESOURCE_UNAVAILABLE', message: queryError.message }],
      appliedBindings: [],
      outcome: 'UNAVAILABLE',
      data: null,
      diagnostics: {
        execution: {
          status: 'FALLBACK',
          phase: 'promotions_query',
          elapsedMs: Date.now() - queryStartedAt,
          error: queryError,
        },
      },
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
    data: { promotions },
  }
}
