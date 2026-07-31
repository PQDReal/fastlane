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
type Context = { params: Promise<{ promotionId: string }> }

function authError(error: unknown) {
  if (error instanceof ApiAuthError) return authErrorResponse(error)
  throw error
}

function isProductTypesColumnMissing(error: { code?: string; message: string }) {
  return error.code === 'PGRST204' ||
    (error.message.includes('applicable_product_types') || error.message.includes('is_public'))
}

export async function GET(request: Request, context: Context) {
  try { await authorizeAdminPromotionRequest(request) } catch (error) { return authError(error) }

  const { promotionId } = await context.params
  const supabase = getSupabaseAdmin()
  const current = await supabase
    .from('promotions')
    .select(SELECT)
    .eq('id', promotionId)
    .maybeSingle()

  if (!current.error) {
    if (!current.data) {
      return NextResponse.json({ error: 'Không tìm thấy khuyến mãi.' }, { status: 404 })
    }
    return NextResponse.json(current.data)
  }
  if (!isProductTypesColumnMissing(current.error)) {
    return NextResponse.json({ error: 'Không thể tải khuyến mãi.' }, { status: 500 })
  }

  const legacy = await supabase
    .from('promotions')
    .select(LEGACY_SELECT)
    .eq('id', promotionId)
    .maybeSingle()
  if (legacy.error) {
    return NextResponse.json({ error: 'Không thể tải khuyến mãi.' }, { status: 500 })
  }
  if (!legacy.data) {
    return NextResponse.json({ error: 'Không tìm thấy khuyến mãi.' }, { status: 404 })
  }

  const { applicable_product_type, ...promotion } = legacy.data
  return NextResponse.json({
    ...promotion,
    applicable_product_types: productTypesFromLegacy(applicable_product_type),
    is_public: true,
  })
}

export async function PATCH(request: Request, context: Context) {
  try { await authorizeAdminPromotionRequest(request) } catch (error) { return authError(error) }
  try {
    const { promotionId } = await context.params
    const body = await request.json()
    const updates: Record<string, unknown> = {}

    if ('isActive' in body) {
      if (typeof body.isActive !== 'boolean') return NextResponse.json({ error: 'Trạng thái không hợp lệ.' }, { status: 400 })
      updates.is_active = body.isActive
    }

    if ('isPublic' in body) {
      if (typeof body.isPublic !== 'boolean') return NextResponse.json({ error: 'Trạng thái công khai không hợp lệ.' }, { status: 400 })
      updates.is_public = body.isPublic
    }

    const hasFormFields = ['code', 'name', 'description', 'type', 'value', 'applicableProductTypes', 'maxDiscountAmount', 'minimumOrderAmount', 'usageLimit', 'startsAt', 'endsAt'].some((key) => key in body)
    if (hasFormFields) {
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

      if (!/^[A-Z0-9_-]{3,64}$/.test(code)) return NextResponse.json({ error: 'Mã khuyến mãi không hợp lệ.' }, { status: 400 })
      if (description.length > 2000) return NextResponse.json({ error: 'Mô tả không được vượt quá 2000 ký tự.' }, { status: 400 })
      if (!name || name.length > 255 || !type) return NextResponse.json({ error: 'Tên hoặc loại khuyến mãi không hợp lệ.' }, { status: 400 })
      if (applicableProductTypes.length === 0) return NextResponse.json({ error: 'Vui lòng chọn ít nhất một loại sản phẩm áp dụng.' }, { status: 400 })
      if (maxDiscountAmount !== null && (!Number.isFinite(maxDiscountAmount) || maxDiscountAmount < 0)) return NextResponse.json({ error: 'Giá trị khuyến mãi tối đa không hợp lệ.' }, { status: 400 })
      if (!Number.isFinite(minimumOrderAmount) || minimumOrderAmount < 0) return NextResponse.json({ error: 'Giá trị đơn hàng tối thiểu không hợp lệ.' }, { status: 400 })
      if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1)) return NextResponse.json({ error: 'Số lượt sử dụng phải là số nguyên lớn hơn 0.' }, { status: 400 })
      if (!Number.isFinite(value) || value <= 0 || (type === 'PERCENT' && value > 100)) return NextResponse.json({ error: type === 'PERCENT' ? 'Phần trăm giảm phải lớn hơn 0 và không vượt quá 100.' : 'Số tiền giảm phải lớn hơn 0.' }, { status: 400 })
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) return NextResponse.json({ error: 'Thời gian kết thúc phải sau thời gian bắt đầu.' }, { status: 400 })

      Object.assign(updates, {
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
      })
    }

    if (!Object.keys(updates).length) return NextResponse.json({ error: 'Không có dữ liệu cần cập nhật.' }, { status: 400 })
    updates.updated_at = new Date().toISOString()
    const { data, error } = await getSupabaseAdmin().from('promotions').update(updates).eq('id', promotionId).select(SELECT).maybeSingle()
    if (error) {
      const message = error.code === '23505'
        ? 'Mã khuyến mãi đã tồn tại.'
        : error.code === 'PGRST204' || (error.message.includes('applicable_product_types') || error.message.includes('is_public'))
          ? 'Database chưa áp dụng migration loại sản phẩm đa lựa chọn.'
          : 'Không thể cập nhật khuyến mãi.'
      return NextResponse.json({ error: message }, { status: error.code === '23505' ? 409 : 400 })
    }
    if (!data) return NextResponse.json({ error: 'Không tìm thấy khuyến mãi.' }, { status: 404 })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 })
  }
}

export async function DELETE(request: Request, context: Context) {
  try { await authorizeAdminPromotionRequest(request) } catch (error) { return authError(error) }

  const { promotionId } = await context.params
  const { data, error } = await getSupabaseAdmin()
    .from('promotions')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', promotionId)
    .select('id')
    .maybeSingle()

  if (error) {
    return NextResponse.json(
      { error: 'Không thể ngừng áp dụng khuyến mãi.' },
      { status: 500 },
    )
  }
  if (!data) {
    return NextResponse.json(
      { error: 'Không tìm thấy khuyến mãi.' },
      { status: 404 },
    )
  }
  return new Response(null, { status: 204 })
}
