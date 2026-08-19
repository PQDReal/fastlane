import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultFile = path.join(ROOT, 'public', 'data', 'after-sales.json')
const fileArgument = process.argv.find(argument => argument.startsWith('--file='))?.slice('--file='.length)
const file = path.resolve(fileArgument || defaultFile)
const manifestFile = path.join(ROOT, 'scripts', 'data', 'after-sales-source-manifest.json')
const data = JSON.parse(fs.readFileSync(file, 'utf8'))
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
const records = Array.isArray(data.records) ? data.records : []
const expectedSources = new Map((manifest.sources || []).map(source => [source.id, source]))
const errors = []
const warnings = []
const seenIds = new Set()
const seenUrls = new Set()
const allowedServiceTypes = new Set(['after-sales-hub', 'warranty', 'maintenance', 'repair', 'rescue', 'service-center'])
const verifiedCaptureMethods = new Set(['http', 'browserless_playwright', 'browserbase_playwright', 'local_playwright'])

function isOfficialUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && (url.hostname === 'vinfastauto.com' || url.hostname.endsWith('.vinfastauto.com'))
  } catch {
    return false
  }
}

if (data.schemaVersion !== 2) errors.push(`unsupported schemaVersion ${data.schemaVersion}`)
if (data.sourceSystem !== 'VINFAST_OFFICIAL') errors.push('sourceSystem must be VINFAST_OFFICIAL')
if (records.length !== expectedSources.size) errors.push(`expected ${expectedSources.size} records, found ${records.length}`)

for (const record of records) {
  const key = record.sourceId || 'unknown'
  const expected = expectedSources.get(record.sourceId)
  if (!expected) errors.push(`${key}: source is not present in approved manifest`)
  if (seenIds.has(record.sourceId)) errors.push(`${key}: duplicate sourceId`)
  seenIds.add(record.sourceId)
  if (seenUrls.has(record.sourceUrl)) errors.push(`${key}: duplicate source URL`)
  seenUrls.add(record.sourceUrl)

  if (!record.snapshotId) errors.push(`${key}: missing snapshotId`)
  if (!isOfficialUrl(record.sourceUrl)) errors.push(`${key}: source URL is not official`)
  if (!isOfficialUrl(record.finalUrl)) errors.push(`${key}: final URL is not official`)
  if (expected && record.sourceUrl !== expected.url) errors.push(`${key}: source URL differs from manifest`)
  if (!allowedServiceTypes.has(record.serviceType)) errors.push(`${key}: invalid serviceType ${record.serviceType}`)
  if (!verifiedCaptureMethods.has(record.captureMethod)) errors.push(`${key}: source capture not verified (${record.captureMethod})`)
  if (record.captureMethod === 'browserless_playwright' && record.contentValidation?.status !== 'passed') {
    errors.push(`${key}: Browserless capture is missing expected-content validation`)
  }
  if (record.httpStatus !== 200 || record.availability !== 'available') errors.push(`${key}: source is unavailable (HTTP ${record.httpStatus})`)
  if ((record.text || '').trim().length < 120) errors.push(`${key}: content too short (${(record.text || '').trim().length} chars)`)
  if (!/^sha256:[a-f0-9]{64}$/i.test(record.contentHash || '')) errors.push(`${key}: invalid content hash`)
  if (!record.capturedAt || Number.isNaN(Date.parse(record.capturedAt))) errors.push(`${key}: invalid capturedAt`)
  if (!record.title) warnings.push(`${key}: missing title`)
  if (!['.dvhm-revamp-page', 'metadata_only'].includes(record.extractionScope)) {
    errors.push(`${key}: invalid or missing extractionScope`)
  }
  if ((record.captureWarnings || []).length) warnings.push(`${key}: ${record.captureWarnings.length} capture warning(s)`)

  for (const asset of record.assets || []) {
    if (!isOfficialUrl(asset.url)) errors.push(`${key}: non-official asset URL ${asset.url}`)
    if (!['image', 'pdf'].includes(asset.type)) errors.push(`${key}: unsupported asset type ${asset.type}`)
  }
}

for (const sourceId of expectedSources.keys()) {
  if (!seenIds.has(sourceId)) errors.push(`missing manifest source ${sourceId}`)
}

const report = {
  validatorVersion: 'after-sales-data-validator-v2',
  checkedAt: new Date().toISOString(),
  file,
  summary: {
    records: records.length,
    assets: records.reduce((sum, record) => sum + (record.assets?.length || 0), 0),
    providerFallbacks: records.reduce((sum, record) => sum + (record.acquisitionFailures?.length || 0), 0),
    errors: errors.length,
    warnings: warnings.length,
  },
  errors,
  warnings,
  decision: errors.length ? 'REJECT' : warnings.length ? 'REVIEW' : 'PASS',
}

const reportPath = path.join(ROOT, '.local', 'after-sales', 'validation-report.json')
fs.mkdirSync(path.dirname(reportPath), { recursive: true })
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if (errors.length) process.exitCode = 1
