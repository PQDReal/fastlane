import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  containsSensitiveLocatorData,
  isRetryableLocatorFetchError,
  parseLocatorSettings,
  selectServiceLocationRecords,
  sha256,
} from './lib/after-sales-service-locations.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT_ROOT = path.join(ROOT, '.local', 'after-sales', 'service-locations', 'raw')
const WORKSHOP_SNAPSHOT = path.join(ROOT, '.local', 'after-sales', 'snapshots', 'vinfast-service-workshops', 'latest.json')
const MAX_PAYLOAD_CHARACTERS = 100_000_000
const MAX_FETCH_ATTEMPTS = 3
const ALLOWED_CDN_HOST = 'static-cms-prod.vinfastauto.com'

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function fetchText(url, timeoutMs = 120_000) {
  if (url.protocol !== 'https:' || url.hostname !== ALLOWED_CDN_HOST) {
    throw new Error(`Blocked non-approved locator host: ${url.hostname}`)
  }
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'error',
        headers: { accept: 'application/json', 'user-agent': 'FastlaneAfterSalesLocatorWorker/1.0' },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) {
        const error = new Error(`Locator fetch failed with HTTP ${response.status}`)
        error.status = response.status
        throw error
      }
      const text = await response.text()
      if (text.length > MAX_PAYLOAD_CHARACTERS) {
        throw new Error('Locator payload exceeded the 100 MB decoded safety limit')
      }
      return { text, attempts: attempt }
    } catch (error) {
      if (attempt >= MAX_FETCH_ATTEMPTS || !isRetryableLocatorFetchError(error)) throw error
      await new Promise(resolve => setTimeout(resolve, 250 * (2 ** (attempt - 1))))
    }
  }
  throw new Error('Locator fetch exhausted retry attempts')
}

if (!fs.existsSync(WORKSHOP_SNAPSHOT)) throw new Error('Workshop browser snapshot is missing; run acquisition first')
const workshopSnapshot = JSON.parse(fs.readFileSync(WORKSHOP_SNAPSHOT, 'utf8'))
const locatorSettings = parseLocatorSettings(workshopSnapshot.html)
const cdnBase = new URL(`${String(locatorSettings.cdn_base).replace(/\/+$/u, '')}/`)
if (cdnBase.protocol !== 'https:' || cdnBase.hostname !== ALLOWED_CDN_HOST || cdnBase.pathname !== '/locators/') {
  throw new Error('Workshop snapshot points to an unapproved locator CDN path')
}

const metadataUrl = new URL('locators-meta.json', cdnBase)
const metadataFetch = await fetchText(metadataUrl, 30_000)
const metadataText = metadataFetch.text
const metadata = JSON.parse(metadataText)
if (!Number.isInteger(metadata.generation) || !/^locators-\d+\.json\.gz$/u.test(metadata.full || '')) {
  throw new Error('Locator metadata does not contain a valid generation/full snapshot pair')
}
const locatorDataUrl = new URL(metadata.full, cdnBase)
const payloadFetch = await fetchText(locatorDataUrl)
const payloadText = payloadFetch.text
const payload = JSON.parse(payloadText)
const { records, categories } = selectServiceLocationRecords(payload, locatorSettings)
if (!records.length) throw new Error('No in-scope service locations were found')
if (containsSensitiveLocatorData(records)) throw new Error('Sensitive locator fields survived the acquisition allowlist')

const capturedAt = new Date().toISOString()
const snapshotId = `vinfast-service-locations-${capturedAt.replace(/[:.]/gu, '-')}`
const result = {
  schemaVersion: 1,
  snapshotId,
  capturedAt,
  sourceSystem: 'VINFAST_OFFICIAL',
  sourceUrl: workshopSnapshot.sourceUrl,
  workshopSnapshotId: workshopSnapshot.snapshotId,
  locatorMetadataUrl: metadataUrl.toString(),
  locatorDataUrl: locatorDataUrl.toString(),
  locatorGeneration: metadata.generation,
  upstreamCount: Number(metadata.count) || (payload.data || []).length,
  upstreamStatus: payload.status ?? null,
  upstreamMetadataHash: sha256(metadataText),
  upstreamDecodedPayloadHash: sha256(payloadText),
  upstreamPayloadStored: false,
  acquisition: {
    metadataFetchAttempts: metadataFetch.attempts,
    payloadFetchAttempts: payloadFetch.attempts,
    maxFetchAttempts: MAX_FETCH_ATTEMPTS,
  },
  scope: {
    categories,
    excludedCategories: ['service_bus', 'service_gsm', 'showroom_car', 'showroom_escooter', 'car_charging_station', 'bike_charging_station', 'battery_swap_station'],
    ownerManualsIncluded: false,
  },
  security: {
    projectionPolicy: 'explicit_field_allowlist',
    removedSensitiveFields: ['incident_data_attributes', 'custom_url'],
    sourceMutationAllowed: false,
  },
  recordCount: records.length,
  records,
}
writeJson(path.join(OUTPUT_ROOT, `${snapshotId}.json`), result)
writeJson(path.join(OUTPUT_ROOT, 'latest.json'), result)
console.log(JSON.stringify({ snapshotId, locatorGeneration: metadata.generation, upstreamCount: result.upstreamCount, scopedRecords: records.length, categories }, null, 2))
