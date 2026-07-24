import { NextResponse } from 'next/server'
import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const SELECT = 'id,code,name,type,value,starts_at,ends_at,is_active,created_at,updated_at'
function authError(error: unknown) { if (error instanceof ApiAuthError) return authErrorResponse(error); throw error }
function parseBody(body: any) {
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const type = body.type === 'PERCENT' || body.type === 'FIXED' ? body.type : null
  const value = Number(body.value)
  const startsAt = typeof body.startsAt === 'string' ? new Date(body.startsAt) : new Date(NaN)
  const endsAt = typeof body.endsAt === 'string' ? new Date(body.endsAt) : new Date(NaN)
  if (!/^[A-Z0-9_-]{3,64}$/.test(code)) throw new Error('Mã khuyến mãi phải có 3-64 ký tự, chỉ gồm chữ, số, dấu gạch ngang hoặc gạch dưới.')
  if (!name || name.length > 255) throw new Error('Tên chương trình không hợp lệ.')
  if (!type) throw new Error('Loại khuyến mãi không hợp lệ.')
  if (!Number.isFinite(value) || value <= 0 || (type === 'PERCENT' && value > 100)) throw new Error(type === 'PERCENT' ? 'Phần trăm giảm phải lớn hơn 0 và không vượt quá 100.' : 'Số tiền giảm phải lớn hơn 0.')
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) throw new Error('Thời gian kết thúc phải sau thời gian bắt đầu.')
  if (startsAt.getTime() < Date.now()) throw new Error('Thời gian bắt đầu không được ở trong quá khứ.')
  return { code, name, type, value, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), is_active: body.isActive === true }
}

export async function GET(request: Request) {
  try { await authorizeAdminCatalogRequest(request) } catch (error) { return authError(error) }
  const { data, error } = await getSupabaseAdmin().from('promotions').select(SELECT).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Không thể tải dữ liệu khuyến mãi.' }, { status: 500 })
  return NextResponse.json(data ?? [])
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