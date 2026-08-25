import 'server-only'

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { mapShowroomRow, type Showroom, type ShowroomRow, type ShowroomVehicleType } from './types'

export const SHOWROOM_SELECT = [
  'id', 'source', 'source_entity_id', 'store_id', 'code', 'vehicle_type',
  'name', 'address', 'province_source_id', 'province_name',
  'district_source_id', 'district_name', 'latitude', 'longitude', 'hotline',
  'service_hotline', 'sales_open_time', 'sales_close_time',
  'service_open_time', 'service_close_time', 'management_mode', 'is_active',
  'created_at', 'updated_at',
].join(',')

export type ShowroomFilters = {
  activeOnly?: boolean
  vehicleType?: ShowroomVehicleType | null
  provinceName?: string | null
  bounds?: { west: number; south: number; east: number; north: number } | null
}

export async function readShowrooms(filters: ShowroomFilters = {}): Promise<Showroom[]> {
  const pageSize = 1000
  const rows: ShowroomRow[] = []

  for (let from = 0; ; from += pageSize) {
    let query = getSupabaseAdmin()
      .from('showrooms')
      .select(SHOWROOM_SELECT)
      .order('name')
      .range(from, from + pageSize - 1)

    if (filters.activeOnly !== false) query = query.eq('is_active', true)
    if (filters.vehicleType) query = query.eq('vehicle_type', filters.vehicleType)
    if (filters.provinceName) query = query.eq('province_name', filters.provinceName)
    if (filters.bounds) {
      query = query
        .gte('longitude', filters.bounds.west)
        .lte('longitude', filters.bounds.east)
        .gte('latitude', filters.bounds.south)
        .lte('latitude', filters.bounds.north)
    }

    const result = await query
    if (result.error) throw result.error
    const page = (result.data ?? []) as unknown as ShowroomRow[]
    rows.push(...page)
    if (page.length < pageSize) break
  }

  return rows.map(mapShowroomRow)
}
