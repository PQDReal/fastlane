import { NextResponse } from 'next/server'

import { SHOWROOM_CACHE_PREFIX } from '@/lib/cache-keys'
import { readRedisJson, writeRedisJson } from '@/lib/redis'
import { readShowrooms, type ShowroomFilters } from '@/lib/showrooms/server'
import type { Showroom, ShowroomVehicleType } from '@/lib/showrooms/types'

const TTL_SECONDS = 300

function vehicleType(value: string | null): ShowroomVehicleType | null {
  if (value === null || value === '') return null
  if (value === 'car' || value === 'motorbike') return value
  throw new Error('Loại xe không hợp lệ.')
}

function bounds(value: string | null): ShowroomFilters['bounds'] {
  if (!value) return null
  const numbers = value.split(',').map(Number)
  if (numbers.length !== 4 || numbers.some((item) => !Number.isFinite(item))) {
    throw new Error('Bounding box không hợp lệ.')
  }
  const [west, south, east, north] = numbers
  if (west >= east || south >= north || west < -180 || east > 180 || south < -90 || north > 90) {
    throw new Error('Bounding box không hợp lệ.')
  }
  return { west, south, east, north }
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams
  let filters: ShowroomFilters
  try {
    const provinceName = searchParams.get('province_name')?.trim() || null
    if (provinceName && provinceName.length > 120) throw new Error('Tỉnh/thành phố không hợp lệ.')
    filters = {
      activeOnly: true,
      vehicleType: vehicleType(searchParams.get('vehicle_type')),
      provinceName,
      bounds: bounds(searchParams.get('bbox')),
    }
  } catch (error) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: error instanceof Error ? error.message : 'Bộ lọc không hợp lệ.' } },
      { status: 400 },
    )
  }

  const cacheKey = `${SHOWROOM_CACHE_PREFIX}${encodeURIComponent(JSON.stringify(filters))}`
  try {
    let rows = await readRedisJson<Showroom[]>(cacheKey)
    if (!rows) {
      rows = await readShowrooms(filters)
      await writeRedisJson(cacheKey, rows, TTL_SECONDS)
    }
    return NextResponse.json({ data: rows })
  } catch (error) {
    console.error('Unable to load showrooms:', error)
    return NextResponse.json(
      { error: { code: 'SHOWROOMS_UNAVAILABLE', message: 'Không thể tải danh sách showroom.' } },
      { status: 500 },
    )
  }
}
