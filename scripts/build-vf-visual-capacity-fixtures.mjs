import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'

const seedDirectory = path.resolve(
  process.argv[2] || '.local/knowledge-build/v2/visual-analysis/db-seed',
)
const outputDirectory = path.resolve(
  process.argv[3] || '.local/knowledge-build/v2/visual-analysis/capacity-dry-run',
)

async function readJsonLines(name) {
  const rows = []
  const input = readline.createInterface({
    input: fs.createReadStream(path.join(seedDirectory, name), { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })
  for await (const line of input) if (line.trim()) rows.push(JSON.parse(line))
  return rows
}

function stableUuid(value) {
  const hex = crypto.createHash('sha256').update(value).digest('hex').slice(0, 32).split('')
  hex[12] = '4'
  hex[16] = '8'
  const joined = hex.join('')
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`
}

function csvValue(value) {
  if (value == null) return ''
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function csv(headers, rows) {
  return [headers.join(','), ...rows.map((row) => headers.map((key) => csvValue(row[key])).join(','))].join('\n') + '\n'
}

function pgTextArray(values) {
  return `{${(values || []).map((value) => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`
}

const [assets, occurrences, annotations] = await Promise.all([
  readJsonLines('assets.v1.jsonl'),
  readJsonLines('occurrences.v1.jsonl'),
  readJsonLines('annotations.v1.jsonl'),
])

const assetIdByHash = new Map(assets.map((row) => [row.sha256, stableUuid(`asset:${row.sha256}`)]))
const documentSource = new Map()
for (const occurrence of occurrences) {
  if (!documentSource.has(occurrence.documentKey)) documentSource.set(occurrence.documentKey, occurrence)
}
const documentIdByKey = new Map([...documentSource.keys()].map((key) => [key, stableUuid(`document:${key}`)]))
const versionIdByKey = new Map([...documentSource].map(([key, row]) => [
  key,
  stableUuid(`version:${key}:${row.versionContentChecksum}`),
]))

const documentRows = [...documentSource].map(([documentKey, occurrence]) => ({
  id: documentIdByKey.get(documentKey),
  slug: `visual-capacity-${crypto.createHash('sha256').update(documentKey).digest('hex').slice(0, 20)}`,
  title: documentKey,
  category: 'TECHNICAL_GUIDE',
  status: 'DRAFT',
  published_version: 0,
  content_markdown: '# Visual capacity fixture',
  document_key: documentKey,
  locale: 'vi-VN',
  market: 'VN',
  vehicle_model: occurrence.relationMetadata?.vehicleModels?.[0] || '',
  model_year: occurrence.relationMetadata?.modelYears?.[0] || '',
  vehicle_type: 'CAR',
  lifecycle_status: 'ACTIVE',
}))

const versionRows = [...documentSource].map(([documentKey, occurrence]) => ({
  id: versionIdByKey.get(documentKey),
  document_id: documentIdByKey.get(documentKey),
  version_no: 1,
  content_markdown: '# Visual capacity fixture',
  content_checksum: occurrence.versionContentChecksum,
  publication_status: 'DRAFT',
  index_status: 'PENDING',
}))

const assetRows = assets.map((row) => ({
  id: assetIdByHash.get(row.sha256),
  sha256: row.sha256,
  mime_type: row.mimeType,
  byte_size: row.byteSize,
  width: row.width,
  height: row.height,
}))

const occurrenceRows = occurrences.map((row) => ({
  id: stableUuid(`occurrence:${row.sourceOccurrenceId}`),
  asset_id: assetIdByHash.get(row.assetSha256),
  version_id: versionIdByKey.get(row.documentKey),
  source_occurrence_id: row.sourceOccurrenceId,
  source_packet_id: row.sourcePacketId,
  source_node_id: row.sourceNodeId,
  source_url: row.sourceUrl,
  source_locator: JSON.stringify(row.sourceLocator || {}),
  ordinal: row.ordinal,
  role: row.role,
  context_text: row.contextText,
  relation_metadata: JSON.stringify(row.relationMetadata || {}),
  retrieval_enabled: row.retrievalEnabled,
}))

const annotationRows = annotations.map((row) => ({
  id: stableUuid(`annotation:${row.assetSha256}:${row.contentHash}`),
  asset_id: assetIdByHash.get(row.assetSha256),
  revision_no: row.revisionNo,
  status: 'AI_DRAFT',
  decision: row.decision,
  image_type: row.imageType,
  title: row.title,
  summary: row.summary,
  keywords: pgTextArray(row.keywords),
  visible_text: pgTextArray(row.visibleText),
  relations: JSON.stringify(row.relations || []),
  confidence: row.confidence,
  retrieval_recommendation: row.retrievalRecommendation,
  safety_critical: row.safetyCritical,
  content_hash: row.contentHash,
  source_asset_sha256: row.sourceAssetSha256,
  source_packet_id: row.sourcePacketId,
  provenance: JSON.stringify(row.provenance || {}),
}))

fs.mkdirSync(outputDirectory, { recursive: true })
const outputs = {
  documents: ['id', 'slug', 'title', 'category', 'status', 'published_version', 'content_markdown', 'document_key', 'locale', 'market', 'vehicle_model', 'model_year', 'vehicle_type', 'lifecycle_status'],
  versions: ['id', 'document_id', 'version_no', 'content_markdown', 'content_checksum', 'publication_status', 'index_status'],
  assets: ['id', 'sha256', 'mime_type', 'byte_size', 'width', 'height'],
  occurrences: ['id', 'asset_id', 'version_id', 'source_occurrence_id', 'source_packet_id', 'source_node_id', 'source_url', 'source_locator', 'ordinal', 'role', 'context_text', 'relation_metadata', 'retrieval_enabled'],
  annotations: ['id', 'asset_id', 'revision_no', 'status', 'decision', 'image_type', 'title', 'summary', 'keywords', 'visible_text', 'relations', 'confidence', 'retrieval_recommendation', 'safety_critical', 'content_hash', 'source_asset_sha256', 'source_packet_id', 'provenance'],
}
const rowSets = { documents: documentRows, versions: versionRows, assets: assetRows, occurrences: occurrenceRows, annotations: annotationRows }
for (const [name, headers] of Object.entries(outputs)) {
  fs.writeFileSync(path.join(outputDirectory, `${name}.csv`), csv(headers, rowSets[name]), 'utf8')
}

process.stdout.write(`${JSON.stringify({
  status: 'CAPACITY_FIXTURES_READY',
  outputDirectory,
  documents: documentRows.length,
  versions: versionRows.length,
  assets: assetRows.length,
  occurrences: occurrenceRows.length,
  annotations: annotationRows.length,
}, null, 2)}\n`)
