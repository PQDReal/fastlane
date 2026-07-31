import { NextResponse } from 'next/server'

import { authorizeAdminPromotionRequest } from '@/lib/auth/admin-promotions'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import {
  legacyProductType,
  productTypesFromLegacy,
  promotionProductTypes,
} from '@/lib/promotions/product-types'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const SELECT = 'id,code,name,description,type,value,applicable_product_types,max_discount_amount,minimum_order_amount,usage_limit,used_count,starts_at,ends_at,is_active,is_public,created_at,updated_at'
const LEGACY_SELECT = 'id,code,name,description,type,value,applicable_product_type,max_discount_amount,minimum_order_amount,usage_limit,used_count,starts_at,ends_at,is_active,created_at,updated_at'

function authError(error: unknown) {
  if (error instanceof ApiAuthError) return authErrorResponse(error)
  throw error
}

function currentDateInVietnam() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function parseBody(body: any) {
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  const type = body.type === 'PERCENT' || body.type === 'FIXED' ? body.type : null
  const value = Number(body.value)
  const applicableProductTypes = promotionProductTypes(body.applicableProductTypes)
  const maxDiscountAmount = body.maxDiscountAmount === null || body.maxDiscountAmount === '' ? null : Number(body.maxDiscountAmount)
  const minimumOrderAmount = Number(body.minimumOrderAmount ?? 0)
  const usageLimit = body.usageLimit === null || body.usageLimit === '' ? null : Number(body.usageLimit)
  const startsAt = typeof body.startsAt === 'string' ? new Date(body.startsAt) : new Date(NaN)
  const endsAt = typeof body.endsAt === 'string' ? new Date(body.endsAt) : new Date(NaN)

  if (!/^[A-Z0-9_-]{3,64}$/.test(code)) throw new Error('Mã khuyến mãi phải có 3-64 ký tự, chỉ gồm chữ, số, dấu gạch ngang hoặc gạch dưới.')
  if (!name || name.length > 255) throw new Error('Tên chương trình không hợp lệ.')
  if (description.length > 2000) throw new Error('Mô tả không được vượt quá 2000 ký tự.')
  if (!type) throw new Error('Loại khuyến mãi không hợp lệ.')
  if (applicableProductTypes.length === 0) throw new Error('Vui lòng chọn ít nhất một loại sản phẩm áp dụng.')
  if (maxDiscountAmount !== null && (!Number.isFinite(maxDiscountAmount) || maxDiscountAmount < 0)) throw new Error('Giá trị khuyến mãi tối đa không hợp lệ.')
  if (!Number.isFinite(minimumOrderAmount) || minimumOrderAmount < 0) throw new Error('Giá trị đơn hàng tối thiểu không hợp lệ.')
  if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1)) throw new Error('Số lượt sử dụng phải là số nguyên lớn hơn 0.')
  if (!Number.isFinite(value) || value <= 0 || (type === 'PERCENT' && value > 100)) throw new Error(type === 'PERCENT' ? 'Phần trăm giảm phải lớn hơn 0 và không vượt quá 100.' : 'Số tiền giảm phải lớn hơn 0.')
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) throw new Error('Thời gian kết thúc phải sau thời gian bắt đầu.')

  const submittedStartDate = typeof body.startsAt === 'string' ? body.startsAt.slice(0, 10) : ''
  if (submittedStartDate < currentDateInVietnam()) throw new Error('Ngày bắt đầu không được ở trong quá khứ.')

  return {
    code,
    name,
    description: description || null,
    type,
    value,
    applicable_product_types: applicableProductTypes,
    applicable_product_type: legacyProductType(applicableProductTypes),
    max_discount_amount: maxDiscountAmount,
    minimum_order_amount: minimumOrderAmount,
    usage_limit: usageLimit,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    is_active: body.isActive !== false,
    is_public: body.isPublic !== false,
  }
}

export async function GET(request: Request) {
  try { await authorizeAdminPromotionRequest(request) } catch (error) { return authError(error) }
  const supabase = getSupabaseAdmin()
  const result = await supabase.from('promotions').select(SELECT).order('created_at', { ascending: false })
  if (!result.error) return NextResponse.json(result.data ?? [])

  const legacy = await supabase.from('promotions').select(LEGACY_SELECT).order('created_at', { ascending: false })
  if (legacy.error) return NextResponse.json({ error: 'Không thể tải dữ liệu khuyến mãi.' }, { status: 500 })
  return NextResponse.json((legacy.data ?? []).map(({ applicable_product_type, ...item }) => ({
    ...item,
    applicable_product_types: productTypesFromLegacy(applicable_product_type),
    is_public: true,
  })))
}

export async function POST(request: Request) {
  try { await authorizeAdminPromotionRequest(request) } catch (error) { return authError(error) }
  try {
    const values = parseBody(await request.json())
    const { data, error } = await getSupabaseAdmin().from('promotions').insert(values).select(SELECT).single()
    if (error) {
      const message = error.code === '23505'
        ? 'Mã khuyến mãi đã tồn tại.'
        : error.code === 'PGRST204' || (error.message.includes('applicable_product_types') || error.message.includes('is_public'))
          ? 'Database chưa áp dụng migration loại sản phẩm đa lựa chọn.'
          : 'Không thể thêm khuyến mãi.'
      return NextResponse.json({ error: message }, { status: error.code === '23505' ? 409 : 400 })
    }
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Dữ liệu không hợp lệ.' }, { status: 400 })
  }
}
