import { NextResponse } from 'next/server'

const API_BASE = 'https://provinces.open-api.vn/api/v2'

type Province = { name: string; code: number; wards?: Ward[] }
type Ward = { name: string; code: number; province_code: number }

function validProvince(value: unknown): value is Province {
  return Boolean(value && typeof value === 'object' && typeof (value as Province).name === 'string' && Number.isInteger((value as Province).code))
}

function validWard(value: unknown): value is Ward {
  return Boolean(value && typeof value === 'object' && typeof (value as Ward).name === 'string' && Number.isInteger((value as Ward).code))
}

export async function GET(request: Request) {
  const rawCode = new URL(request.url).searchParams.get('provinceCode')
  const provinceCode = rawCode === null ? null : Number(rawCode)
  if (rawCode !== null && (!Number.isInteger(provinceCode) || Number(provinceCode) <= 0)) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Mã tỉnh/thành phố không hợp lệ.' } }, { status: 400 })
  }

  try {
    const endpoint = provinceCode === null
      ? `${API_BASE}/p/`
      : `${API_BASE}/p/${provinceCode}?depth=2`
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 86400 },
    })
    if (!response.ok) throw new Error(`Province API returned ${response.status}`)
    const payload: unknown = await response.json()

    if (provinceCode === null) {
      if (!Array.isArray(payload)) throw new Error('Province API returned an invalid province list')
      const provinces = payload.filter(validProvince).map((province) => ({ code: province.code, name: province.name }))
      return NextResponse.json({ data: provinces })
    }

    if (!validProvince(payload)) throw new Error('Province API returned an invalid province')
    const wards = Array.isArray(payload.wards) ? payload.wards.filter(validWard).map((ward) => ({ code: ward.code, name: ward.name })) : []
    return NextResponse.json({ data: wards })
  } catch (error) {
    console.error('Unable to load Vietnam administrative locations:', error)
    return NextResponse.json({ error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Không thể tải danh sách tỉnh thành. Vui lòng thử lại.' } }, { status: 502 })
  }
}
