import 'server-only'

import { productTypesFromLegacy, promotionProductTypes } from '@/lib/promotions/product-types'
import type { PromotionProductType } from '@/lib/promotions/product-types'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type PromotionRow = {
  id: string
  code: string
  name: string
  description: string | null
  type: string
  value: number | string
  applicable_product_types?: unknown
  applicable_product_type?: unknown
  usage_scope?: unknown
  is_public?: boolean
  target_user_id?: string | null
  max_discount_amount?: number | string | null
  minimum_order_amount?: number | string | null
  usage_limit?: number | string | null
  used_count?: number | string | null
  starts_at: string
  ends_at: string
  is_active: boolean
  updated_at?: string | null
}

export type SalesAgentPromotion = {
  promotionId: string
  code: string
  name: string
  description: string | null
  type: string
  value: number
  maxDiscountAmount: number | null
  minimumOrderAmount: number
  applicableProductTypes: PromotionProductType[]
  applicability: 'TYPE_LEVEL_ONLY'
  startsAt: string
  endsAt: string
  dataAsOf: string
}

export type CurrentSalesAgentPromotionsResult = {
  items: SalesAgentPromotion[]
  warnings: Array<{ code: string; message: string }>
}

const CURRENT_SELECT = 'id,code,name,description,type,value,applicable_product_types,applicable_product_type,usage_scope,is_public,target_user_id,max_discount_amount,minimum_order_amount,usage_limit,used_count,starts_at,ends_at,is_active,updated_at'
const LEGACY_SELECT = 'id,code,name,description,type,value,applicable_product_type,max_discount_amount,minimum_order_amount,usage_limit,used_count,starts_at,ends_at,is_active,updated_at'

function number(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function isPublicScope(row: PromotionRow) {
  if (row.is_public === false || row.target_user_id) return false
  const scope = typeof row.usage_scope === 'string' ? row.usage_scope.toUpperCase() : null
  if (scope && !['PUBLIC', 'ALL', 'GLOBAL', 'ANONYMOUS'].includes(scope)) return false
  return true
}

function productTypes(row: PromotionRow) {
  return row.applicable_product_types === undefined
    ? productTypesFromLegacy(row.applicable_product_type)
    : promotionProductTypes(row.applicable_product_types)
}

function current(row: PromotionRow, readAt: Date, productType?: PromotionProductType) {
  if (!row.is_active || !isPublicScope(row)) return false
  const startsAt = Date.parse(row.starts_at)
  const endsAt = Date.parse(row.ends_at)
  const now = readAt.getTime()
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || now < startsAt || now >= endsAt) return false
  if (row.usage_limit !== null && row.usage_limit !== undefined && number(row.used_count) >= number(row.usage_limit)) return false
  return !productType || productTypes(row).includes(productType)
}

function toPromotion(row: PromotionRow, dataAsOf: string): SalesAgentPromotion {
  return {
    promotionId: String(row.id),
    code: String(row.code),
    name: String(row.name),
    description: row.description ?? null,
    type: String(row.type),
    value: number(row.value),
    maxDiscountAmount: row.max_discount_amount === null || row.max_discount_amount === undefined ? null : number(row.max_discount_amount),
    minimumOrderAmount: number(row.minimum_order_amount),
    applicableProductTypes: productTypes(row),
    applicability: 'TYPE_LEVEL_ONLY',
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    dataAsOf,
  }
}

export async function getCurrentSalesAgentPromotions(input: { productType?: PromotionProductType } = {}, readAt = new Date()): Promise<CurrentSalesAgentPromotionsResult> {
  const supabase = getSupabaseAdmin()
  const currentQuery = await supabase
    .from('promotions')
    .select(CURRENT_SELECT)
    .eq('is_active', true)
  let rows: PromotionRow[]
  let warnings: Array<{ code: string; message: string }> = []
  if (!currentQuery.error) {
    rows = (currentQuery.data ?? []) as PromotionRow[]
  } else {
    const legacyQuery = await supabase
      .from('promotions')
      .select(LEGACY_SELECT)
      .eq('is_active', true)
    if (legacyQuery.error) throw new Error(`Không thể đọc khuyến mãi cho agent: ${legacyQuery.error.message}`)
    rows = (legacyQuery.data ?? []) as PromotionRow[]
    warnings = [{ code: 'PROMOTION_SCOPE_FIELDS_UNAVAILABLE', message: 'Không đọc được đầy đủ trường public/user scope; chỉ hiển thị khuyến mãi active theo thời gian và loại sản phẩm.' }]
  }
  const dataAsOf = new Date().toISOString()
  return {
    items: rows
      .filter((row) => current(row, readAt, input.productType))
      .sort((left, right) => Date.parse(left.ends_at) - Date.parse(right.ends_at) || left.code.localeCompare(right.code))
      .map((row) => toPromotion(row, dataAsOf)),
    warnings,
  }
}
