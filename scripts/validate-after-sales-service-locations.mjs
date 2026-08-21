import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { containsSensitiveLocatorData } from './lib/after-sales-service-locations.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const INPUT = path.join(ROOT, '.local', 'after-sales', 'service-locations', 'extracted', 'latest.json')
const OUTPUT = path.join(ROOT, '.local', 'after-sales', 'service-locations', 'validation-report.json')
const errors = []
const warnings = []

if (!fs.existsSync(INPUT)) throw new Error('Extracted service-location dataset is missing')
const data = JSON.parse(fs.readFileSync(INPUT, 'utf8'))
const ids = new Set()
for (const record of data.records || []) {
  if (!record.id || ids.has(record.id)) errors.push(`missing or duplicate id: ${record.id || '(missing)'}`)
  ids.add(record.id)
  if (!record.name) errors.push(`${record.id}: missing name`)
  if (!record.address?.fullAddress) errors.push(`${record.id}: missing address`)
  if (!['official_car_workshop', 'partner_car_workshop', 'electric_motorbike_workshop'].includes(record.locationCategory)) {
    errors.push(`${record.id}: invalid location category`)
  }
  if (!record.vehicleTypes?.length || record.vehicleTypes.some(type => !['car', 'motorbike'].includes(type))) {
    errors.push(`${record.id}: vehicle type is outside approved scope`)
  }
  if (!['active', 'inactive', 'unknown'].includes(record.status)) errors.push(`${record.id}: invalid status ${record.status}`)
  if (record.statusBasis !== 'official_locator_record') errors.push(`${record.id}: status is not tied to the official locator record`)
  if (String(record.evidence?.upstreamStatus) === '1' && record.status !== 'active') {
    errors.push(`${record.id}: upstream status 1 must normalize to active`)
  }
  if (String(record.evidence?.upstreamStatus) === '0' && record.status !== 'inactive') {
    errors.push(`${record.id}: upstream status 0 must normalize to inactive`)
  }
  if (record.status === 'unknown') warnings.push(`${record.id}: upstream activity status is unknown`)
  if (record.address?.latitude === null || record.address?.longitude === null) warnings.push(`${record.id}: missing valid coordinates`)
  if (!record.contact?.servicePhone && !record.contact?.generalPhone) warnings.push(`${record.id}: missing contact phone`)
  if (!record.evidence?.rawRecordHash) errors.push(`${record.id}: missing raw evidence hash`)
}
if (containsSensitiveLocatorData(data)) errors.push('Extracted dataset contains a blocked internal locator field or Salesforce URL')
if (data.publicationStatus !== 'not_approved' || data.adminReviewStatus !== 'not_started') {
  errors.push('Pre-review dataset has an invalid publication/review status')
}
if (!data.records?.length) errors.push('Extracted dataset is empty')
warnings.push('Per-location warranty/maintenance/repair capabilities are not declared by the locator feed and must not be inferred before admin review')

const report = {
  checkedAt: new Date().toISOString(),
  sourceSnapshotId: data.sourceSnapshotId,
  summary: {
    records: data.records?.length || 0,
    errors: errors.length,
    warnings: warnings.length,
    active: (data.records || []).filter(record => record.status === 'active').length,
    inactive: (data.records || []).filter(record => record.status === 'inactive').length,
    unknown: (data.records || []).filter(record => record.status === 'unknown').length,
  },
  errors,
  warnings,
  decision: errors.length ? 'REJECT' : warnings.length ? 'READY_FOR_ADMIN_REVIEW' : 'PASS',
  nextGate: 'ADMIN_REVIEW',
}
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(report, null, 2))
if (errors.length) process.exitCode = 1
