import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const apply = process.argv.includes('--apply')
const reconcile = process.argv.includes('--reconcile')
const expected = { car: 306, motorbike: 742, total: 1048 }
const batchSize = 200

function requiredText(value, field, context) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) throw new Error(`${context}: thiếu ${field}`)
  return text
}

function optionalText(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || null
}

function coordinate(value, field, minimum, maximum, context) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`${context}: ${field} không hợp lệ`)
  }
  return number
}

async function load(path, vehicleType) {
  const payload = JSON.parse(await readFile(path, 'utf8'))
  if (!Array.isArray(payload.data)) throw new Error(`${path}: data phải là mảng`)
  return payload.data.map((source, index) => {
    const context = `${path}#${index + 1}`
    return {
      source: 'vinfast',
      source_entity_id: requiredText(source.entity_id, 'entity_id', context),
      store_id: requiredText(source.store_id, 'store_id', context),
      code: optionalText(source.code),
      vehicle_type: vehicleType,
      name: requiredText(source.name, 'name', context),
      address: requiredText(source.address, 'address', context),
      province_source_id: optionalText(source.province_id),
      province_name: requiredText(source.province_name, 'province_name', context),
      district_source_id: optionalText(source.district_id),
      district_name: optionalText(source.district_name),
      latitude: coordinate(source.lat, 'lat', -90, 90, context),
      longitude: coordinate(source.lng, 'lng', -180, 180, context),
      hotline: optionalText(source.hotline),
      service_hotline: optionalText(source.hotline_xdv),
      sales_open_time: optionalText(source.open_time_sales),
      sales_close_time: optionalText(source.close_time_sales),
      service_open_time: optionalText(source.open_time_service),
      service_close_time: optionalText(source.close_time_service),
      management_mode: 'IMPORT',
      is_active: String(source.status ?? '1') === '1',
      source_payload: source,
      updated_at: new Date().toISOString(),
    }
  })
}

function comparable(row) {
  return JSON.stringify({
    source_entity_id: row.source_entity_id,
    code: row.code,
    vehicle_type: row.vehicle_type,
    name: row.name,
    address: row.address,
    province_source_id: row.province_source_id,
    province_name: row.province_name,
    district_source_id: row.district_source_id,
    district_name: row.district_name,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    hotline: row.hotline,
    service_hotline: row.service_hotline,
    sales_open_time: row.sales_open_time,
    sales_close_time: row.sales_close_time,
    service_open_time: row.service_open_time,
    service_close_time: row.service_close_time,
    is_active: row.is_active,
    source_payload: row.source_payload,
  })
}

function chunks(rows) {
  const result = []
  for (let index = 0; index < rows.length; index += batchSize) {
    result.push(rows.slice(index, index + batchSize))
  }
  return result
}

const rows = [
  ...await load('public/data/showroomcar.json', 'car'),
  ...await load('public/data/showroomescooter.json', 'motorbike'),
]
const storeIds = new Set(rows.map((row) => row.store_id))
const carCount = rows.filter((row) => row.vehicle_type === 'car').length
const motorbikeCount = rows.filter((row) => row.vehicle_type === 'motorbike').length

if (carCount !== expected.car || motorbikeCount !== expected.motorbike || rows.length !== expected.total) {
  throw new Error(`Sai số lượng nguồn: car=${carCount}, motorbike=${motorbikeCount}, total=${rows.length}`)
}
if (storeIds.size !== rows.length) throw new Error('Nguồn showroom có store_id trùng lặp')

console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', reconcile, carCount, motorbikeCount, total: rows.length }, null, 2))
if (!apply) process.exit(0)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY')
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const existingResult = await supabase
  .from('showrooms')
  .select('id,store_id,management_mode,source_entity_id,code,vehicle_type,name,address,province_source_id,province_name,district_source_id,district_name,latitude,longitude,hotline,service_hotline,sales_open_time,sales_close_time,service_open_time,service_close_time,is_active,source_payload')
  .eq('source', 'vinfast')
  .limit(5000)
if (existingResult.error) throw existingResult.error

const existingByStore = new Map((existingResult.data ?? []).map((row) => [row.store_id, row]))
const protectedRows = rows.filter((row) => existingByStore.get(row.store_id)?.management_mode === 'ADMIN')
const writableRows = rows.filter((row) => existingByStore.get(row.store_id)?.management_mode !== 'ADMIN')
const changedRows = writableRows.filter((row) => {
  const existing = existingByStore.get(row.store_id)
  return !existing || comparable(existing) !== comparable(row)
})

let written = 0
for (const batch of chunks(changedRows)) {
  const result = await supabase
    .from('showrooms')
    .upsert(batch, { onConflict: 'store_id' })
    .select('id,store_id')
  if (result.error) throw result.error
  written += result.data?.length ?? 0

  const auditRows = (result.data ?? []).map((saved) => ({
    showroom_id: saved.id,
    action: 'IMPORT',
    before_data: existingByStore.get(saved.store_id) ?? null,
    after_data: batch.find((row) => row.store_id === saved.store_id) ?? null,
  }))
  if (auditRows.length) {
    const audit = await supabase.from('showroom_audit_logs').insert(auditRows)
    if (audit.error) throw audit.error
  }
}

let deactivated = 0
if (reconcile) {
  const stale = (existingResult.data ?? []).filter((row) =>
    row.management_mode === 'IMPORT' && row.is_active && !storeIds.has(row.store_id),
  )
  for (const row of stale) {
    const updated = await supabase
      .from('showrooms')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('management_mode', 'IMPORT')
      .select('id')
      .maybeSingle()
    if (updated.error) throw updated.error
    if (!updated.data) continue
    deactivated += 1
    const audit = await supabase.from('showroom_audit_logs').insert({
      showroom_id: row.id,
      action: 'RECONCILE',
      before_data: row,
      after_data: { ...row, is_active: false },
    })
    if (audit.error) throw audit.error
  }
}

const [carVerification, motorbikeVerification, totalVerification] = await Promise.all([
  supabase.from('showrooms').select('id', { count: 'exact', head: true }).eq('source', 'vinfast').eq('vehicle_type', 'car'),
  supabase.from('showrooms').select('id', { count: 'exact', head: true }).eq('source', 'vinfast').eq('vehicle_type', 'motorbike'),
  supabase.from('showrooms').select('id', { count: 'exact', head: true }).eq('source', 'vinfast'),
])
for (const verification of [carVerification, motorbikeVerification, totalVerification]) {
  if (verification.error) throw verification.error
}
const storedCar = carVerification.count ?? 0
const storedMotorbike = motorbikeVerification.count ?? 0
const storedTotal = totalVerification.count ?? 0

console.log(JSON.stringify({ written, protected: protectedRows.length, deactivated, storedCar, storedMotorbike, storedTotal }, null, 2))
