import { NextResponse } from 'next/server'
import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const SELECT = 'id,code,name,type,value,starts_at,ends_at,is_active,created_at,updated_at'
type Context = { params: Promise<{ promotionId: string }> }
function authError(error: unknown) { if (error instanceof ApiAuthError) return authErrorResponse(error); throw error }

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

    const hasFormFields = ['code', 'name', 'type', 'value', 'startsAt', 'endsAt'].some((key) => key in body)
    if (hasFormFields) {
      const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      const type = body.type === 'PERCENT' || body.type === 'FIXED' ? body.type : null
      const value = Number(body.value)
      const startsAt = typeof body.startsAt === 'string' ? new Date(body.startsAt) : new Date(NaN)
      const endsAt = typeof body.endsAt === 'string' ? new Date(body.endsAt) : new Date(NaN)
      if (!/^[A-Z0-9_-]{3,64}$/.test(code)) return NextResponse.json({ error: 'Mã khuyến mãi không hợp lệ.' }, { status: 400 })
      if (!name || name.length > 255 || !type) return NextResponse.json({ error: 'Tên hoặc loại khuyến mãi không hợp lệ.' }, { status: 400 })
      if (!Number.isFinite(value) || value <= 0 || (type === 'PERCENT' && value > 100)) return NextResponse.json({ error: type === 'PERCENT' ? 'Phần trăm giảm phải lớn hơn 0 và không vượt quá 100.' : 'Số tiền giảm phải lớn hơn 0.' }, { status: 400 })
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) return NextResponse.json({ error: 'Thời gian kết thúc phải sau thời gian bắt đầu.' }, { status: 400 })
      Object.assign(updates, { code, name, type, value, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() })
    }

    if (!Object.keys(updates).length) return NextResponse.json({ error: 'Không có dữ liệu cần cập nhật.' }, { status: 400 })
    updates.updated_at = new Date().toISOString()
    const { data, error } = await getSupabaseAdmin().from('promotions').update(updates).eq('id', promotionId).select(SELECT).maybeSingle()
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'Mã khuyến mãi đã tồn tại.' : 'Không thể cập nhật khuyến mãi.' }, { status: error.code === '23505' ? 409 : 400 })
    if (!data) return NextResponse.json({ error: 'Không tìm thấy khuyến mãi.' }, { status: 404 })
    return NextResponse.json(data)
  } catch { return NextResponse.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 }) }
}