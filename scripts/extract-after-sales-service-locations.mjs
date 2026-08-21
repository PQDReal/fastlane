import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildAdministrativeMaps,
  normalizeServiceLocation,
  parseLocatorSettings,
} from './lib/after-sales-service-locations.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const INPUT = path.join(ROOT, '.local', 'after-sales', 'service-locations', 'raw', 'latest.json')
const WORKSHOP_SNAPSHOT = path.join(ROOT, '.local', 'after-sales', 'snapshots', 'vinfast-service-workshops', 'latest.json')
const OUTPUT_ROOT = path.join(ROOT, '.local', 'after-sales', 'service-locations', 'extracted')

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

if (!fs.existsSync(INPUT)) throw new Error('Service-location raw snapshot is missing')
const raw = JSON.parse(fs.readFileSync(INPUT, 'utf8'))
const workshop = JSON.parse(fs.readFileSync(WORKSHOP_SNAPSHOT, 'utf8'))
const locatorSettings = parseLocatorSettings(workshop.html)
const administrativeMaps = buildAdministrativeMaps(locatorSettings)
const context = {
  administrativeMaps,
  sourceUrl: raw.sourceUrl,
  locatorDataUrl: raw.locatorDataUrl,
  locatorGeneration: raw.locatorGeneration,
  capturedAt: raw.capturedAt,
}
const records = raw.records.map(record => normalizeServiceLocation(record, context))
const countsByCategory = records.reduce((counts, record) => {
  counts[record.locationCategory] = (counts[record.locationCategory] || 0) + 1
  return counts
}, {})
const result = {
  schemaVersion: 1,
  extractorVersion: 'after-sales-service-locations-v1',
  extractedAt: new Date().toISOString(),
  sourceSnapshotId: raw.snapshotId,
  publicationStatus: 'not_approved',
  adminReviewStatus: 'not_started',
  summary: {
    records: records.length,
    active: records.filter(record => record.status === 'active').length,
    inactive: records.filter(record => record.status === 'inactive').length,
    unknown: records.filter(record => record.status === 'unknown').length,
    withCoordinates: records.filter(record => record.address.latitude !== null && record.address.longitude !== null).length,
    withServicePhone: records.filter(record => record.contact.servicePhone).length,
    withBookingAction: records.filter(record => record.bookingActions.length).length,
    countsByCategory,
  },
  taxonomy: {
    serviceTypes: ['general_after_sales', 'maintenance', 'repair'],
    capabilityPolicy: 'Only explicitly published per-location capabilities may be added; category membership does not imply warranty, maintenance, and repair simultaneously.',
  },
  records,
}
writeJson(path.join(OUTPUT_ROOT, `${raw.snapshotId}.json`), result)
writeJson(path.join(OUTPUT_ROOT, 'latest.json'), result)
console.log(JSON.stringify(result.summary, null, 2))
