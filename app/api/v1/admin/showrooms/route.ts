import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'

import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { SHOWROOM_CACHE_PREFIX } from '@/lib/cache-keys'
import { deleteRedisKeysByPrefix } from '@/lib/redis'
import { parseShowroomInput } from '@/lib/showrooms/input'
import { SHOWROOM_SELECT } from '@/lib/showrooms/server'
import { mapShowroomRow, type ShowroomRow } from '@/lib/showrooms/types'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

function authError(error: unknown) {
  if (error instanceof ApiAuthError) return authErrorResponse(error)
  throw error
}

function safeSearch(value: string) {
  return value.replace(/[(),%_]/g, '').trim().slice(0, 100)
}

export async function GET(request: Request) {
  try { await authorizeAdminCatalogRequest(request) } catch (error) { return authError(error) }
  const params = new URL(request.url).searchParams
  const page = Math.max(1, Number(params.get('page') || 1) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(params.get('page_size') || 20) || 20))
  const search = safeSearch(params.get('search') || '')
  const supabase = getSupabaseAdmin()
  let query = supabase.from('showrooms').select(SHOWROOM_SELECT, { count: 'exact' }).order('updated_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1)
  if (search) query = query.or(`name.ilike.%${search}%,address.ilike.%${search}%,store_id.ilike.%${search}%,code.ilike.%${search}%`)
  if (params.get('vehicle_type') === 'car' || params.get('vehicle_type') === 'motorbike') query = query.eq('vehicle_type', params.get('vehicle_type'))
  if (params.get('status') === 'active') query = query.eq('is_active', true)
  if (params.get('status') === 'inactive') query = query.eq('is_active', false)
  const result = await query
  if (result.error) return NextResponse.json({ error: 'Không thể tải danh sách showroom.' }, { status: 500 })
  const total = result.count ?? 0
  return NextResponse.json({ data: (result.data ?? []).map((row) => mapShowroomRow(row as unknown as ShowroomRow)), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } })
}

export async function POST(request: Request) {
  try { await authorizeAdminCatalogRequest(request) } catch (error) { return authError(error) }
  try {
    const input = parseShowroomInput(await request.json())
    const sourceId = randomUUID()
    const now = new Date().toISOString()
    const result = await getSupabaseAdmin().from('showrooms').insert({
      source: 'admin', source_entity_id: sourceId, store_id: `admin-${sourceId}`, management_mode: 'ADMIN',
      name: input.name, address: input.address, code: input.code, vehicle_type: input.vehicleType,
      province_source_id: input.provinceSourceId, province_name: input.provinceName,
      district_source_id: input.districtSourceId, district_name: input.districtName,
      latitude: input.latitude, longitude: input.longitude, hotline: input.hotline,
      service_hotline: input.serviceHotline, sales_open_time: input.salesOpenTime, sales_close_time: input.salesCloseTime,
      service_open_time: input.serviceOpenTime, service_close_time: input.serviceCloseTime,
      is_active: input.isActive, created_at: now, updated_at: now,
    }).select(SHOWROOM_SELECT).single()
    if (result.error) return NextResponse.json({ error: 'Không thể thêm showroom.' }, { status: 400 })
    await getSupabaseAdmin().from('showroom_audit_logs').insert({ showroom_id: (result.data as unknown as { id: string }).id, action: 'CREATE', after_data: result.data })
    await deleteRedisKeysByPrefix(SHOWROOM_CACHE_PREFIX)
    return NextResponse.json(mapShowroomRow(result.data as unknown as ShowroomRow), { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Dữ liệu không hợp lệ.' }, { status: 400 })
  }
}
