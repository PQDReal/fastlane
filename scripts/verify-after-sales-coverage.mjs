import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/data/after-sales-source-manifest.json'), 'utf8'))
const refreshPolicy = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/data/after-sales-refresh-policy.json'), 'utf8'))
const report = JSON.parse(fs.readFileSync(path.join(ROOT, '.local/after-sales/acquisition-report.json'), 'utf8'))
const now = Date.now()
const maxAgeOverride = process.env.AFTER_SALES_MAX_AGE_HOURS ? Number(process.env.AFTER_SALES_MAX_AGE_HOURS) : null
const officialHost = /(^|\.)vinfastauto\.com$/i
const verifiedCaptureMethods = new Set(['http', 'brightdata_browser_api', 'browserless_playwright', 'browserbase_playwright', 'local_playwright'])
const results = []

function transformedFallback(sourceId) {
  const file = path.join(ROOT, '.local', 'after-sales', 'transformed-snapshots', sourceId, 'latest.json')
  if (!fs.existsSync(file)) return null
  const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'))
  return {
    captureMethod: snapshot.captureMethod,
    capturedAt: snapshot.capturedAt,
    textLength: snapshot.text?.length || 0,
    publicationEligible: snapshot.transformation?.publicationEligible === true,
  }
}

for (const source of manifest.sources) {
  const reportSource = report.sources.find(item => item.sourceId === source.id)
  const latestAttempt = report.runSources?.find(item => item.sourceId === source.id)
  const file = path.join(ROOT, '.local/after-sales/snapshots', source.id, 'latest.json')
  const errors = [], warnings = []
  if (!reportSource) errors.push('missing acquisition report entry')
  if (!fs.existsSync(file)) errors.push('missing latest snapshot')
  if (fs.existsSync(file)) {
    const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (snapshot.sourceUrl !== source.url) errors.push('source URL mismatch')
    if (!officialHost.test(new URL(snapshot.sourceUrl).hostname)) errors.push('non-official source host')
    if (!verifiedCaptureMethods.has(snapshot.captureMethod)) errors.push(`verified source capture unavailable: ${snapshot.captureMethod}`)
    if (['brightdata_browser_api', 'browserless_playwright'].includes(snapshot.captureMethod) && snapshot.contentValidation?.status !== 'passed') {
      errors.push('Managed browser capture is missing expected service-workshop content validation')
    }
    if (snapshot.httpStatus !== 200) errors.push(`unexpected HTTP status ${snapshot.httpStatus}`)
    if (!snapshot.contentHash) errors.push('missing content hash')
    if (!snapshot.text || snapshot.text.length < 200) warnings.push('short extracted text')
    const ageHours = (now - Date.parse(snapshot.capturedAt)) / 3600000
    const maxAgeHours = maxAgeOverride || refreshPolicy.freshnessSlaHours[source.serviceType] || 168
    if (!Number.isFinite(ageHours) || ageHours > maxAgeHours) errors.push(`stale snapshot: ${Math.round(ageHours)}h exceeds ${maxAgeHours}h SLA`)
    if (!['.dvhm-revamp-page', 'metadata_only'].includes(snapshot.extractionScope)) errors.push(`invalid extraction scope: ${snapshot.extractionScope}`)
    if ((snapshot.captureWarnings || []).length) warnings.push(`capture warnings: ${snapshot.captureWarnings.length}`)
    if (latestAttempt?.latestRetained) warnings.push(`latest refresh failed; retained ${latestAttempt.retainedSnapshotId}`)
    const links = [...new Set(snapshot.discoveredLinks || [])]
    const requests = [...new Set(snapshot.requestedUrls || [])]
    const unsafeLinks = links.filter(url => { try { return !officialHost.test(new URL(url).hostname) } catch { return true } })
    const manualLinksExcluded = links.filter(url => /tai-lieu-o-to|huong-dan-su-dung|hdsd/iu.test(url)).length
    const pdfCount = (snapshot.assets || []).filter(asset => asset.type === 'pdf').length
    if (source.serviceType === 'repair' && pdfCount) errors.push(`repair source contains ${pdfCount} unrelated PDF(s)`)
    results.push({ sourceId: source.id, captureMethod: snapshot.captureMethod, providerFailures: (snapshot.acquisitionFailures || []).length, extractionScope: snapshot.extractionScope, textLength: snapshot.text.length, assets: (snapshot.assets || []).length, pdfs: pdfCount, discoveredLinks: links.length, requestedUrls: requests.length, externalLinksExcluded: unsafeLinks.length, manualLinksExcluded, maxAgeHours, ageHours: Number(ageHours.toFixed(2)), transformedFallback: errors.length ? transformedFallback(source.id) : null, errors, warnings })
  } else results.push({ sourceId: source.id, transformedFallback: transformedFallback(source.id), errors, warnings })
}

const summary = {
  sources: results.length,
  passing: results.filter(item => !item.errors.length && !item.warnings.length).length,
  needsReview: results.filter(item => !item.errors.length && item.warnings.length).length,
  failing: results.filter(item => item.errors.length).length,
}
const output = { checkedAt: new Date().toISOString(), maxAgeOverride, summary, recrawlSourceIds: results.filter(item => item.errors.length).map(item => item.sourceId), results, decision: summary.failing ? 'RECRAWL_REQUIRED' : summary.needsReview ? 'REVIEW' : 'PASS' }
const reportPath = path.join(ROOT, '.local/after-sales/coverage-report.json')
fs.mkdirSync(path.dirname(reportPath), { recursive: true })
fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify(output, null, 2))
if (summary.failing) process.exitCode = 1
