import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const apply = process.argv.includes('--apply')
const API_BASE = 'https://provinces.open-api.vn/api/v2'
const normalize = (value) => String(value ?? '').normalize('NFC').toLocaleLowerCase('vi').replace(/^(tỉnh|thành phố|tp\.?|tp)\s+/i, '').replace(/\s+/g, ' ').trim()
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY')

const provinceResponse = await fetch(`${API_BASE}/p/`, { headers: { Accept: 'application/json' } })
if (!provinceResponse.ok) throw new Error(`Không thể tải tỉnh/thành: HTTP ${provinceResponse.status}`)
const provinces = await provinceResponse.json()
const provincesByName = new Map(provinces.map((item) => [normalize(item.name), item]))
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const showroomRows = []
for (let offset = 0; ; offset += 1000) {
  const result = await supabase.from('showrooms').select('id,name,province_name,district_name,province_source_id,district_source_id').range(offset, offset + 999)
  if (result.error) throw result.error
  showroomRows.push(...(result.data ?? []))
  if ((result.data ?? []).length < 1000) break
}
const wardsByProvince = new Map()
async function getWards(code) {
  if (wardsByProvince.has(code)) return wardsByProvince.get(code)
  const response = await fetch(`${API_BASE}/p/${code}?depth=2`, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Không thể tải phường/xã của tỉnh ${code}: HTTP ${response.status}`)
  const payload = await response.json()
  const wards = Array.isArray(payload.wards) ? payload.wards : []
  wardsByProvince.set(code, wards)
  return wards
}
const changes = []
const unmatched = []
for (const showroom of showroomRows) {
  const province = provincesByName.get(normalize(showroom.province_name))
  if (!province) { unmatched.push({ name: showroom.name, reason: 'province' }); continue }
  const ward = (await getWards(province.code)).find((item) => normalize(item.name) === normalize(showroom.district_name))
  if (!ward) { unmatched.push({ name: showroom.name, reason: 'ward' }); continue }
  const update = { province_source_id: String(province.code), province_name: province.name, district_source_id: String(ward.code), district_name: ward.name, updated_at: new Date().toISOString() }
  if (String(showroom.province_source_id ?? '') !== update.province_source_id || String(showroom.district_source_id ?? '') !== update.district_source_id || showroom.province_name !== update.province_name || showroom.district_name !== update.district_name) changes.push({ showroom, update })
}
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', total: showroomRows.length, changes: changes.length, unmatched: unmatched.length, examples: unmatched.slice(0, 10) }, null, 2))
if (!apply) process.exit(0)
for (let offset = 0; offset < changes.length; offset += 25) {
  const batch = changes.slice(offset, offset + 25)
  const results = await Promise.all(batch.map(({ showroom, update }) => supabase.from('showrooms').update(update).eq('id', showroom.id)))
  const failure = results.find((item) => item.error)
  if (failure?.error) throw failure.error
}
console.log(`Đã cập nhật ${changes.length} showroom.`)
