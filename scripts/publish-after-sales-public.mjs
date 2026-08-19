import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const input = path.join(ROOT, '.local', 'after-sales', 'acquisition-report.json')
const manifestFile = path.join(ROOT, 'scripts', 'data', 'after-sales-source-manifest.json')
const output = path.join(ROOT, 'public', 'data', 'after-sales.json')
const report = JSON.parse(fs.readFileSync(input, 'utf8'))
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
const sourceById = new Map(manifest.sources.map(source => [source.id, source]))
const snapshots = []

for (const source of report.sources || []) {
  const file = path.join(ROOT, '.local', 'after-sales', 'snapshots', source.sourceId, 'latest.json')
  if (!fs.existsSync(file)) continue
  const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'))
  const sourceDefinition = sourceById.get(snapshot.sourceId)
  snapshots.push({
    snapshotId: snapshot.snapshotId,
    sourceId: snapshot.sourceId,
    sourceUrl: snapshot.sourceUrl,
    serviceType: sourceDefinition?.serviceType || null,
    vehicleType: sourceDefinition?.vehicleType || null,
    scope: sourceDefinition?.scope || null,
    finalUrl: snapshot.finalUrl,
    capturedAt: snapshot.capturedAt,
    captureMethod: snapshot.captureMethod,
    httpStatus: snapshot.httpStatus,
    contentType: snapshot.contentType,
    title: snapshot.title,
    text: snapshot.text,
    assets: snapshot.assets || [],
    extractionScope: snapshot.extractionScope || null,
    captureWarnings: snapshot.captureWarnings || [],
    contentValidation: snapshot.contentValidation || null,
    contentHash: snapshot.contentHash,
    availability: snapshot.availability,
    accuracy: snapshot.accuracy || null,
    reviewStatus: 'pending_admin_review',
    parserVersion: snapshot.parserVersion,
    acquisitionFailures: snapshot.acquisitionFailures || [],
  })
}

const payload = {
  schemaVersion: 2,
  sourceSystem: 'VINFAST_OFFICIAL',
  generatedAt: new Date().toISOString(),
  purpose: 'external_review_cache',
  publicationPolicy: 'official_sources_only; admin_review_required; not_publication_approved',
  notes: [
    'This file contains the latest acquisition result for every source in the approved manifest.',
    'Records must be reviewed by a human before being used by customer-facing features.',
  ],
  sourceManifest: manifest.sources,
  transcribedFacts: manifest.transcribedFacts || [],
  records: snapshots,
}

fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
console.log(`Wrote ${snapshots.length} official after-sales records to ${path.relative(ROOT, output)}`)
