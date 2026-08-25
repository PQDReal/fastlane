import { NextResponse } from 'next/server'
import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { SHOWROOM_CACHE_PREFIX } from '@/lib/cache-keys'
import { deleteRedisKeysByPrefix } from '@/lib/redis'
import { parseShowroomInput } from '@/lib/showrooms/input'
import { SHOWROOM_SELECT } from '@/lib/showrooms/server'
import { mapShowroomRow, type ShowroomRow } from '@/lib/showrooms/types'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

function authError(error: unknown) { if (error instanceof ApiAuthError) return authErrorResponse(error); throw error }

export async function PATCH(request: Request, context: { params: Promise<{ showroomId: string }> }) {
  try { await authorizeAdminCatalogRequest(request) } catch (error) { return authError(error) }
  try {
    const { showroomId } = await context.params
    const input = parseShowroomInput(await request.json())
    const supabase = getSupabaseAdmin()
    const before = await supabase.from('showrooms').select(SHOWROOM_SELECT).eq('id', showroomId).maybeSingle()
    if (before.error) return NextResponse.json({ error: 'Không thể tải showroom.' }, { status: 500 })
    if (!before.data) return NextResponse.json({ error: 'Không tìm thấy showroom.' }, { status: 404 })
    const result = await supabase.from('showrooms').update({
      name: input.name, address: input.address, code: input.code, vehicle_type: input.vehicleType,
      province_source_id: input.provinceSourceId, province_name: input.provinceName,
      district_source_id: input.districtSourceId, district_name: input.districtName,
      latitude: input.latitude, longitude: input.longitude, hotline: input.hotline,
      service_hotline: input.serviceHotline, sales_open_time: input.salesOpenTime, sales_close_time: input.salesCloseTime,
      service_open_time: input.serviceOpenTime, service_close_time: input.serviceCloseTime,
      is_active: input.isActive, management_mode: 'ADMIN', updated_at: new Date().toISOString(),
    }).eq('id', showroomId).select(SHOWROOM_SELECT).single()
    if (result.error) return NextResponse.json({ error: 'Không thể cập nhật showroom.' }, { status: 400 })
    await supabase.from('showroom_audit_logs').insert({ showroom_id: showroomId, action: 'UPDATE', before_data: before.data, after_data: result.data })
    await deleteRedisKeysByPrefix(SHOWROOM_CACHE_PREFIX)
    return NextResponse.json(mapShowroomRow(result.data as unknown as ShowroomRow))
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Dữ liệu không hợp lệ.' }, { status: 400 }) }
}

