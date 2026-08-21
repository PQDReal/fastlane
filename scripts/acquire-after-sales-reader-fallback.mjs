import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'data', 'after-sales-source-manifest.json'), 'utf8'))
const SNAPSHOT_ROOT = path.join(ROOT, '.local', 'after-sales', 'snapshots')
const OUTPUT_ROOT = path.join(ROOT, '.local', 'after-sales', 'transformed-snapshots')
const READER_ORIGIN = 'https://r.jina.ai'

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function latestSnapshot(sourceId) {
  const file = path.join(SNAPSHOT_ROOT, sourceId, 'latest.json')
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
}

function needsFallback(source) {
  const snapshot = latestSnapshot(source.id)
  return !snapshot || snapshot.sourceUrl !== source.url || snapshot.httpStatus !== 200
}

function readerUrl(sourceUrl) {
  const official = new URL(sourceUrl)
  if (official.protocol !== 'https:' || !/(^|\.)vinfastauto\.com$/iu.test(official.hostname)) {
    throw new Error(`Reader fallback rejected non-official source ${sourceUrl}`)
  }
  return new URL(`/https://${official.host}${official.pathname}${official.search}`, READER_ORIGIN)
}

function expectedPattern(source) {
  if (source.serviceType === 'warranty') return /chính sách bảo hành|phạm vi bảo hành/iu
  if (source.serviceType === 'maintenance') return /bảo dưỡng định kỳ|dịch vụ bảo dưỡng/iu
  if (source.serviceType === 'repair') return /dịch vụ sửa chữa|sửa chữa xe/iu
  return /VinFast/iu
}

async function capture(source) {
  const url = readerUrl(source.url)
  const response = await fetch(url, {
    redirect: 'error',
    headers: { accept: 'text/plain', 'user-agent': 'FastlaneAfterSalesReaderFallback/1.0' },
    signal: AbortSignal.timeout(90_000),
  })
  if (!response.ok) throw new Error(`Reader fallback HTTP ${response.status} for ${source.id}`)
  const text = (await response.text()).normalize('NFC').trim()
  if (text.length < 500 || !expectedPattern(source).test(text)) {
    throw new Error(`Reader fallback content validation failed for ${source.id}`)
  }
  const capturedAt = new Date().toISOString()
  return {
    schemaVersion: 1,
    snapshotId: `${source.id}-reader-${capturedAt.replace(/[:.]/gu, '-')}`,
    sourceId: source.id,
    sourceUrl: source.url,
    capturedAt,
    captureMethod: 'jina_reader',
    readerUrl: url.toString(),
    readerHttpStatus: response.status,
    contentType: response.headers.get('content-type') || 'text/plain',
    text,
    contentHash: sha256(text),
    transformation: {
      kind: 'third_party_reader_text',
      rawDomAvailable: false,
      publicationEligible: false,
      limitation: 'Reader output is transformed text and cannot replace a raw DOM/PDF anchor for publication.',
    },
    reviewStatus: 'not_started',
  }
}

const requestedIds = process.argv.filter(argument => argument.startsWith('--source=')).map(argument => argument.slice('--source='.length))
const targets = MANIFEST.sources.filter(source => requestedIds.length ? requestedIds.includes(source.id) : needsFallback(source))
const results = []
for (const source of targets) {
  try {
    const snapshot = await capture(source)
    const sourceDir = path.join(OUTPUT_ROOT, source.id)
    writeJson(path.join(sourceDir, `${snapshot.snapshotId}.json`), snapshot)
    writeJson(path.join(sourceDir, 'latest.json'), snapshot)
    results.push({ sourceId: source.id, status: 'captured', textLength: snapshot.text.length, contentHash: snapshot.contentHash })
  } catch (error) {
    results.push({ sourceId: source.id, status: 'failed', error: error.message })
  }
}
const report = {
  checkedAt: new Date().toISOString(),
  provider: 'jina_reader',
  targets: targets.length,
  captured: results.filter(result => result.status === 'captured').length,
  failed: results.filter(result => result.status === 'failed').length,
  results,
}
writeJson(path.join(OUTPUT_ROOT, 'acquisition-report.json'), report)
console.log(JSON.stringify(report, null, 2))
if (report.failed) process.exitCode = 1

