import { NextResponse } from 'next/server'

import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { legacyProductType, promotionProductTypes } from '@/lib/promotions/product-types'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const SELECT = 'id,code,name,description,type,value,applicable_product_types,max_discount_amount,minimum_order_amount,starts_at,ends_at,is_active,created_at,updated_at'
type Context = { params: Promise<{ promotionId: string }> }

function authError(error: unknown) {
  if (error instanceof ApiAuthError) return authErrorResponse(error)
  throw error
}

export async function PATCH(request: Request, context: Context) {
  try { await authorizeAdminCatalogRequest(request) } catch (error) { return authError(error) }
  try {
    const { promotionId } = await context.params
    const body = await request.json()
    const updates: Record<string, unknown> = {}

    if ('isActive' in body) {
      if (typeof body.isActive !== 'boolean') return NextResponse.json({ error: 'Trạng thái không hợp lệ.' }, { status: 400 })
      updates.is_active = body.isActive
    }

    const hasFormFields = ['code', 'name', 'description', 'type', 'value', 'applicableProductTypes', 'maxDiscountAmount', 'minimumOrderAmount', 'startsAt', 'endsAt'].some((key) => key in body)
    if (hasFormFields) {
      const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      const description = typeof body.description === 'string' ? body.description.trim() : ''
      const type = body.type === 'PERCENT' || body.type === 'FIXED' ? body.type : null
      const value = Number(body.value)
      const applicableProductTypes = promotionProductTypes(body.applicableProductTypes)
      const maxDiscountAmount = body.maxDiscountAmount === null || body.maxDiscountAmount === '' ? null : Number(body.maxDiscountAmount)
      const minimumOrderAmount = Number(body.minimumOrderAmount ?? 0)
      const startsAt = typeof body.startsAt === 'string' ? new Date(body.startsAt) : new Date(NaN)
      const endsAt = typeof body.endsAt === 'string' ? new Date(body.endsAt) : new Date(NaN)

      if (!/^[A-Z0-9_-]{3,64}$/.test(code)) return NextResponse.json({ error: 'Mã khuyến mãi không hợp lệ.' }, { status: 400 })
      if (description.length > 2000) return NextResponse.json({ error: 'Mô tả không được vượt quá 2000 ký tự.' }, { status: 400 })
      if (!name || name.length > 255 || !type) return NextResponse.json({ error: 'Tên hoặc loại khuyến mãi không hợp lệ.' }, { status: 400 })
      if (applicableProductTypes.length === 0) return NextResponse.json({ error: 'Vui lòng chọn ít nhất một loại sản phẩm áp dụng.' }, { status: 400 })
      if (maxDiscountAmount !== null && (!Number.isFinite(maxDiscountAmount) || maxDiscountAmount < 0)) return NextResponse.json({ error: 'Giá trị khuyến mãi tối đa không hợp lệ.' }, { status: 400 })
      if (!Number.isFinite(minimumOrderAmount) || minimumOrderAmount < 0) return NextResponse.json({ error: 'Giá trị đơn hàng tối thiểu không hợp lệ.' }, { status: 400 })
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
        : error.code === 'PGRST204' || error.message.includes('applicable_product_types')
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