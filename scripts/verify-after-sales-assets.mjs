import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const input = path.join(ROOT, 'public/data/after-sales-parsed.json')
const output = path.join(ROOT, 'public/data/after-sales-verified.json')
const reportPath = path.join(ROOT, '.local/after-sales/asset-verification-report.json')
const data = JSON.parse(fs.readFileSync(input, 'utf8'))
const retryFailedOnly = process.argv.includes('--retry-failed')
const previous = retryFailedOnly && fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : null
const previousAssets = new Map((previous?.records || []).flatMap(source => (source.assets || []).map(asset => [`${source.sourceId}|${asset.url}`, asset])))
const hashes = new Map()
const mimeFromMagic = (buffer) => {
  if (buffer.subarray(0, 4).toString() === '%PDF') return 'application/pdf'
  if (buffer.subarray(0, 3).toString('hex') === 'ffd8ff') return 'image/jpeg'
  if (buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return 'image/png'
  if (buffer.subarray(0, 4).toString() === 'GIF8') return 'image/gif'
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'image/webp'
  return null
}
const normalizeMime = value => String(value || '').split(';')[0].trim().toLowerCase() || null
const isAllowedMime = value => value === 'application/pdf' || value?.startsWith('image/')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function fetchAsset(asset, attempts = 3) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const timeout = asset.type === 'pdf' ? 90000 : 45000
      const response = await fetch(asset.url, { redirect: 'follow', signal: AbortSignal.timeout(timeout), headers: { 'user-agent': 'FastlaneAfterSalesAssetVerifier/2.0' } })
      const buffer = Buffer.from(await response.arrayBuffer())
      if (response.ok || attempt === attempts) return { response, buffer, attempts: attempt }
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
      if (attempt === attempts) throw error
    }
    await sleep(250 * attempt)
  }
  throw lastError
}

const summary = { assets: 0, verified: 0, failed: 0, duplicates: 0, mimeMismatch: 0, reused: 0, retried: 0, fetchAttempts: 0 }
const records = []
for (const source of data.records) {
  const assets = []
  for (const asset of source.assets || []) {
    summary.assets++
    const reviewReasons = []
    const item = { ...asset, extractionStatus: asset.classification.dataType === 'policy_document' || asset.classification.dataType === 'informational_graphic_or_table' ? 'pending' : 'not_required', reviewReasons: [...(asset.classification.needsReview ? ['LOW_CONFIDENCE'] : [])], verification: null }
    const previousItem = previousAssets.get(`${source.sourceId}|${asset.url}`)
    const canReuse = previousItem?.verification?.httpStatus === 200
      && !['failed', 'review_required'].includes(previousItem.extractionStatus)
      && !previousItem.reviewReasons?.some(reason => ['FETCH_FAILED', 'UNSUPPORTED_MIME', 'TYPE_MISMATCH'].includes(reason))
    if (retryFailedOnly && canReuse) {
      item.verification = previousItem.verification
      item.contentHash = previousItem.contentHash
      item.reviewReasons = previousItem.reviewReasons || []
      item.extractionStatus = previousItem.extractionStatus
      const duplicateOf = hashes.get(item.contentHash) || null
      hashes.set(item.contentHash, hashes.get(item.contentHash) || `${source.sourceId}:${asset.url}`)
      item.verification = { ...item.verification, duplicateOf }
      if (duplicateOf) { item.reviewReasons = [...new Set([...item.reviewReasons, 'DUPLICATE_CONTENT'])]; summary.duplicates++ }
      summary.reused++
      summary.verified++
      assets.push(item)
      continue
    }
    try {
      const fetched = await fetchAsset(asset)
      const { response, buffer } = fetched
      summary.fetchAttempts += fetched.attempts
      if (retryFailedOnly) summary.retried++
      const declaredType = normalizeMime(response.headers.get('content-type'))
      const detectedType = mimeFromMagic(buffer) || (declaredType === 'image/svg+xml' ? declaredType : null)
      const contentHash = `sha256:${crypto.createHash('sha256').update(buffer).digest('hex')}`
      const duplicateOf = hashes.get(contentHash) || null
      hashes.set(contentHash, hashes.get(contentHash) || `${source.sourceId}:${asset.url}`)
      if (!response.ok) reviewReasons.push('FETCH_FAILED')
      if (!isAllowedMime(declaredType) && !isAllowedMime(detectedType)) reviewReasons.push('UNSUPPORTED_MIME')
      if (declaredType && detectedType && declaredType !== detectedType && !(declaredType === 'image/svg+xml' && detectedType === null)) { reviewReasons.push('TYPE_MISMATCH'); summary.mimeMismatch++ }
      if (duplicateOf) { reviewReasons.push('DUPLICATE_CONTENT'); summary.duplicates++ }
      item.verification = { httpStatus: response.status, finalUrl: response.url, declaredType, detectedType, typeVerified: Boolean(detectedType && (declaredType === detectedType || declaredType === 'application/octet-stream')), byteLength: buffer.length, contentHash, duplicateOf }
      item.contentHash = contentHash
      if (!response.ok || reviewReasons.includes('UNSUPPORTED_MIME') || reviewReasons.includes('TYPE_MISMATCH')) { item.extractionStatus = 'review_required'; summary.failed++ } else summary.verified++
    } catch (error) { reviewReasons.push('FETCH_FAILED'); item.extractionStatus = 'failed'; item.verification = { error: error.message }; summary.failed++ }
    item.reviewReasons = [...new Set([...item.reviewReasons, ...reviewReasons])]
    assets.push(item)
    await sleep(25)
  }
  records.push({ ...source, assets })
}
const result = { ...data, verifierVersion: 'after-sales-assets-v2', verifiedAt: new Date().toISOString(), summary, records }
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.mkdirSync(path.dirname(reportPath), { recursive: true })
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`)
fs.writeFileSync(reportPath, `${JSON.stringify({ verifiedAt: result.verifiedAt, summary }, null, 2)}\n`)
console.log(JSON.stringify(summary, null, 2))
if (summary.failed) process.exitCode = 1
