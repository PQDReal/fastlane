import 'server-only'

import { ApiRouteError } from '@/lib/api/errors'
import { readCustomerCart } from '@/lib/cart/server'
import { productTypesFromLegacy, promotionProductTypes } from '@/lib/promotions/product-types'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type PromotionRow = {
  id: string
  code: string
  name: string
  description: string | null
  type: 'PERCENT' | 'FIXED'
  value: number | string
  applicable_product_types?: unknown
  applicable_product_type?: unknown
  max_discount_amount: number | string | null
  minimum_order_amount: number | string
  usage_limit: number | null
  used_count: number
  starts_at: string
  ends_at: string
  is_active: boolean
  is_public?: boolean
}

export type AccessoryPromotionQuote = {
  promotionId: string
  code: string
  name: string
  description: string | null
  type: 'PERCENT' | 'FIXED'
  value: number
  maxDiscountAmount: number | null
  discountAmount: number
  subtotal: number
  grandTotal: number
}

const CURRENT_SELECT =
  'id,code,name,description,type,value,applicable_product_types,max_discount_amount,minimum_order_amount,usage_limit,used_count,starts_at,ends_at,is_active,is_public'
const LEGACY_SELECT =
  'id,code,name,description,type,value,applicable_product_type,max_discount_amount,minimum_order_amount,usage_limit,used_count,starts_at,ends_at,is_active'

function invalidPromotion(message: string): never {
  throw new ApiRouteError(422, 'PROMOTION_NOT_APPLICABLE', message)
}

async function findPromotion(code: string): Promise<PromotionRow | null> {
  const supabase = getSupabaseAdmin()
  const current = await supabase
    .from('promotions')
    .select(CURRENT_SELECT)
    .eq('code', code)
    .maybeSingle<PromotionRow>()

  if (!current.error) return current.data
  if (
    current.error.code !== 'PGRST204' &&
    !current.error.message.includes('applicable_product_types') &&
    !current.error.message.includes('is_public')
  ) throw new Error(`Unable to load promotion: ${current.error.message}`)

  const legacy = await supabase
    .from('promotions')
    .select(LEGACY_SELECT)
    .eq('code', code)
    .maybeSingle<PromotionRow>()
  if (legacy.error) throw new Error(`Unable to load promotion: ${legacy.error.message}`)
  return legacy.data
}

async function listPromotions(): Promise<PromotionRow[]> {
  const supabase = getSupabaseAdmin()
  const current = await supabase
    .from('promotions')
    .select(CURRENT_SELECT)
    .eq('is_active', true)
    .eq('is_public', true)

  if (!current.error) return (current.data ?? []) as PromotionRow[]
  if (
    current.error.code !== 'PGRST204' &&
    !current.error.message.includes('applicable_product_types') &&
    !current.error.message.includes('is_public')
  ) throw new Error(`Unable to load promotions: ${current.error.message}`)

  const legacy = await supabase
    .from('promotions')
    .select(LEGACY_SELECT)
    .eq('is_active', true)
  if (legacy.error) throw new Error(`Unable to load promotions: ${legacy.error.message}`)
  return (legacy.data ?? []) as PromotionRow[]
}

async function selectedCartSubtotal(
  customerId: string,
  selectedCartItemIds: string[],
) {
  const cart = await readCustomerCart(customerId)
  const selected = new Set(selectedCartItemIds)
  const selectedItems = cart.items.filter((item) => selected.has(item.id))
  if (selected.size === 0 || selectedItems.length !== selected.size) {
    throw new ApiRouteError(
      409,
      'CART_CHANGED',
      'Giỏ hàng đã thay đổi. Vui lòng tải lại trang.',
    )
  }
  return selectedItems.reduce(
    (total, item) => total + Number(item.lineTotal),
    0,
  )
}

function quoteEligiblePromotion(
  promotion: PromotionRow,
  subtotal: number,
  now: number,
): AccessoryPromotionQuote | null {
  if (!promotion.is_active || now < Date.parse(promotion.starts_at)) return null
  if (now >= Date.parse(promotion.ends_at)) return null
  if (
    promotion.usage_limit !== null &&
    Number(promotion.used_count) >= Number(promotion.usage_limit)
  ) return null

  const productTypes = promotion.applicable_product_types === undefined
    ? productTypesFromLegacy(promotion.applicable_product_type)
    : promotionProductTypes(promotion.applicable_product_types)
  if (!productTypes.includes('ACCESSORY')) return null
  if (subtotal < Number(promotion.minimum_order_amount ?? 0)) return null

  const value = Number(promotion.value)
  let discountAmount = promotion.type === 'PERCENT'
    ? Math.round(subtotal * value / 100)
    : Math.round(value)
  if (promotion.max_discount_amount !== null) {
    discountAmount = Math.min(discountAmount, Number(promotion.max_discount_amount))
  }
  discountAmount = Math.max(0, Math.min(discountAmount, subtotal))
  if (discountAmount === 0) return null

  return {
    promotionId: promotion.id,
    code: promotion.code,
    name: promotion.name,
    description: promotion.description,
    type: promotion.type,
    value,
    maxDiscountAmount: promotion.max_discount_amount === null
      ? null
      : Number(promotion.max_discount_amount),
    discountAmount,
    subtotal,
    grandTotal: subtotal - discountAmount,
  }
}

export async function listAccessoryPromotionQuotes(
  customerId: string,
  selectedCartItemIds: string[],
) {
  const subtotal = await selectedCartSubtotal(customerId, selectedCartItemIds)
  const now = Date.now()
  const quotes = (await listPromotions())
    .map((promotion) => quoteEligiblePromotion(promotion, subtotal, now))
    .filter((quote): quote is AccessoryPromotionQuote => quote !== null)
    .sort((left, right) =>
      right.discountAmount - left.discountAmount ||
      left.code.localeCompare(right.code),
    )

  return quotes.map((quote, index) => ({
    ...quote,
    isBest: index === 0,
  }))
}

export async function quoteAccessoryPromotion(
  customerId: string,
  rawCode: string,
  selectedCartItemIds: string[],
): Promise<AccessoryPromotionQuote> {
  const code = rawCode.trim().toUpperCase()
  if (!/^[A-Z0-9_-]{3,64}$/.test(code)) invalidPromotion('Mã giảm giá không hợp lệ.')

  const subtotal = await selectedCartSubtotal(customerId, selectedCartItemIds)
  const promotion = await findPromotion(code)
  if (!promotion) invalidPromotion('Mã giảm giá không tồn tại.')
  if (!promotion.is_active) invalidPromotion('Mã giảm giá đã ngừng áp dụng.')

  const now = Date.now()
  if (now < Date.parse(promotion.starts_at)) invalidPromotion('Mã giảm giá chưa đến thời gian áp dụng.')
  if (now >= Date.parse(promotion.ends_at)) invalidPromotion('Mã giảm giá đã hết hạn.')
  if (
    promotion.usage_limit !== null &&
    Number(promotion.used_count) >= Number(promotion.usage_limit)
  ) invalidPromotion('Mã giảm giá đã hết lượt sử dụng.')

  const productTypes = promotion.applicable_product_types === undefined
    ? productTypesFromLegacy(promotion.applicable_product_type)
    : promotionProductTypes(promotion.applicable_product_types)
  if (!productTypes.includes('ACCESSORY')) invalidPromotion('Mã giảm giá không áp dụng cho phụ kiện.')

  const minimumOrderAmount = Number(promotion.minimum_order_amount ?? 0)
  if (subtotal < minimumOrderAmount) {
    invalidPromotion(`Đơn hàng tối thiểu ${new Intl.NumberFormat('vi-VN').format(minimumOrderAmount)} ₫ để áp dụng mã này.`)
  }

  const quote = quoteEligiblePromotion(promotion, subtotal, now)
  if (!quote) invalidPromotion('Mã giảm giá không tạo ra giá trị giảm cho đơn hàng này.')
  return quote
}