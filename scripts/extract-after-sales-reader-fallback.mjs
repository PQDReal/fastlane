import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'data', 'after-sales-source-manifest.json'), 'utf8'))
const INPUT_ROOT = path.join(ROOT, '.local', 'after-sales', 'transformed-snapshots')
const ACQUISITION_REPORT = path.join(INPUT_ROOT, 'acquisition-report.json')
const OUTPUT = path.join(ROOT, '.local', 'after-sales', 'transformed-extracted.json')

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`
}

function scopedText(source, text) {
  const lines = String(text).split(/\r?\n/gu)
  const contentMarker = lines.findIndex(line => /^Markdown Content:\s*$/iu.test(line.trim()))
  let start = contentMarker >= 0 ? contentMarker + 1 : 0
  if (source.serviceType === 'maintenance') {
    const serviceStart = lines.findIndex((line, index) => index >= start && /^Dịch vụ bảo dưỡng\s*$/iu.test(line.trim()))
    if (serviceStart >= 0) start = serviceStart
  }
  if (source.serviceType === 'repair') {
    const serviceStart = lines.findIndex((line, index) => index >= start && /^#\s+Dịch vụ sửa chữa\s*$/iu.test(line.trim()))
    if (serviceStart >= 0) start = serviceStart
  }
  const scoped = lines.slice(start)
  const sharedDocumentBlock = scoped.findIndex(line => /^(?:#+\s*)?(?:Sổ bảo hành|Hướng dẫn sử dụng)(?:\s+xe|\s+ô tô)/iu.test(line.trim()))
  const companyFooter = scoped.findIndex(line => /^Công ty TNHH Kinh doanh Thương mại và Dịch vụ VinFast\s*$/iu.test(line.trim()))
  const boundaries = [sharedDocumentBlock, companyFooter].filter(index => index >= 0)
  const end = boundaries.length ? Math.min(...boundaries) : scoped.length
  return scoped.slice(0, end).join('\n').trim()
}

function isManualLink(link) {
  return /hướng dẫn sử dụng|\bHDSD\b|owner manual|user manual|tra cứu tài liệu/iu.test(link.label)
    || /\/hdsd\/|\/tai-lieu-(?:o-to|xe-may-dien|ebus)|owner[_%-]?manual|user[_%-]?manual/iu.test(link.url)
}

function links(text) {
  const values = []
  for (const match of String(text).matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/gu)) {
    try {
      const url = new URL(match[2])
      values.push({ label: match[1].trim(), url: url.toString(), official: /(^|\.)vinfastauto\.com$/iu.test(url.hostname) })
    } catch {}
  }
  return [...new Map(values.map(value => [`${value.label}|${value.url}`, value])).values()]
}

function headings(text) {
  return String(text).split(/\r?\n/gu)
    .map(line => line.match(/^(#{1,6})\s+(.+)$/u))
    .filter(Boolean)
    .map(match => ({ level: match[1].length, text: match[2].trim() }))
}

const records = []
const acquisitionReport = fs.existsSync(ACQUISITION_REPORT) ? JSON.parse(fs.readFileSync(ACQUISITION_REPORT, 'utf8')) : null
const activeSourceIds = new Set((acquisitionReport?.results || [])
  .filter(result => result.status === 'captured')
  .map(result => result.sourceId))
for (const source of MANIFEST.sources) {
  if (!activeSourceIds.has(source.id)) continue
  const file = path.join(INPUT_ROOT, source.id, 'latest.json')
  if (!fs.existsSync(file)) continue
  const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'))
  const text = scopedText(source, snapshot.text)
  const discoveredLinks = links(text).filter(link => !isManualLink(link))
  const contentHash = sha256(text)
  records.push({
    sourceId: source.id,
    sourceUrl: source.url,
    serviceType: source.serviceType,
    vehicleType: source.vehicleType,
    sourceSnapshotId: snapshot.snapshotId,
    capturedAt: snapshot.capturedAt,
    captureMethod: snapshot.captureMethod,
    sourceSnapshotHash: snapshot.contentHash,
    contentHash,
    title: snapshot.text.match(/^Title:\s*(.+)$/mu)?.[1]?.trim() || source.id,
    headings: headings(text),
    text,
    discoveredLinks,
    officialPdfLinks: discoveredLinks.filter(link => link.official && /\.pdf(?:$|[?#])/iu.test(link.url)),
    extractionStatus: 'extracted_transformed_text',
    evidenceAnchor: {
      kind: 'reader_text',
      textHash: contentHash,
      rawDomVerified: false,
    },
    publicationEligible: false,
    reviewStatus: 'not_started',
  })
}
const result = {
  schemaVersion: 1,
  extractorVersion: 'after-sales-reader-fallback-v1',
  extractedAt: new Date().toISOString(),
  summary: {
    records: records.length,
    characters: records.reduce((sum, record) => sum + record.text.length, 0),
    officialPdfLinks: records.reduce((sum, record) => sum + record.officialPdfLinks.length, 0),
  },
  publicationStatus: 'blocked_pending_raw_recapture_and_admin_review',
  records,
}
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(result.summary, null, 2))
