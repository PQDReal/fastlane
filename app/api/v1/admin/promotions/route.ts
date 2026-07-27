import { NextResponse } from 'next/server'
import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const SELECT = 'id,code,name,description,type,value,applicable_product_type,max_discount_amount,minimum_order_amount,starts_at,ends_at,is_active,created_at,updated_at'
function authError(error: unknown) { if (error instanceof ApiAuthError) return authErrorResponse(error); throw error }
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
  const applicableProductType = ['ALL', 'CAR', 'BIKE', 'ACCESSORY'].includes(body.applicableProductType) ? body.applicableProductType : null
  const maxDiscountAmount = body.maxDiscountAmount === null || body.maxDiscountAmount === '' ? null : Number(body.maxDiscountAmount)
  const minimumOrderAmount = Number(body.minimumOrderAmount ?? 0)
  const startsAt = typeof body.startsAt === 'string' ? new Date(body.startsAt) : new Date(NaN)
  const endsAt = typeof body.endsAt === 'string' ? new Date(body.endsAt) : new Date(NaN)
  if (!/^[A-Z0-9_-]{3,64}$/.test(code)) throw new Error('Mã khuyến mãi phải có 3-64 ký tự, chỉ gồm chữ, số, dấu gạch ngang hoặc gạch dưới.')
  if (!name || name.length > 255) throw new Error('Tên chương trình không hợp lệ.')
  if (description.length > 2000) throw new Error('Mô tả không được vượt quá 2000 ký tự.')
  if (!type) throw new Error('Loại khuyến mãi không hợp lệ.')
  if (!applicableProductType) throw new Error('Loại sản phẩm áp dụng không hợp lệ.')
  if (maxDiscountAmount !== null && (!Number.isFinite(maxDiscountAmount) || maxDiscountAmount < 0)) throw new Error('Giá trị khuyến mãi tối đa không hợp lệ.')
  if (!Number.isFinite(minimumOrderAmount) || minimumOrderAmount < 0) throw new Error('Giá trị đơn hàng tối thiểu không hợp lệ.')
  if (!Number.isFinite(value) || value <= 0 || (type === 'PERCENT' && value > 100)) throw new Error(type === 'PERCENT' ? 'Phần trăm giảm phải lớn hơn 0 và không vượt quá 100.' : 'Số tiền giảm phải lớn hơn 0.')
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) throw new Error('Thời gian kết thúc phải sau thời gian bắt đầu.')
  const submittedStartDate = typeof body.startsAt === 'string' ? body.startsAt.slice(0, 10) : ''
  if (submittedStartDate < currentDateInVietnam()) throw new Error('Ngày bắt đầu không được ở trong quá khứ.')
  return { code, name, description: description || null, type, value, applicable_product_type: applicableProductType, max_discount_amount: maxDiscountAmount, minimum_order_amount: minimumOrderAmount, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), is_active: body.isActive === true }
}

export async function GET(request: Request) {
  try { await authorizeAdminCatalogRequest(request) } catch (error) { return authError(error) }
  const supabase = getSupabaseAdmin()
  const result = await supabase.from('promotions').select(SELECT).order('created_at', { ascending: false })
  if (!result.error) return NextResponse.json(result.data ?? [])

  const legacy = await supabase
    .from('promotions')
    .select('id,code,name,description,type,value,applicable_vehicle_type,max_discount_amount,minimum_order_amount,starts_at,ends_at,is_active,created_at,updated_at')
    .order('created_at', { ascending: false })
  if (legacy.error) return NextResponse.json({ error: 'Không thể tải dữ liệu khuyến mãi.' }, { status: 500 })
  return NextResponse.json((legacy.data ?? []).map(({ applicable_vehicle_type, ...item }) => ({
    ...item,
    applicable_product_type: applicable_vehicle_type,
  })))
}

export async function POST(request: Request) {
  try { await authorizeAdminCatalogRequest(request) } catch (error) { return authError(error) }
  try {
    const values = parseBody(await request.json())
    const { data, error } = await getSupabaseAdmin().from('promotions').insert(values).select(SELECT).single()
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'Mã khuyến mãi đã tồn tại.' : 'Không thể thêm khuyến mãi.' }, { status: error.code === '23505' ? 409 : 400 })
    return NextResponse.json(data, { status: 201 })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Dữ liệu không hợp lệ.' }, { status: 400 }) }
}