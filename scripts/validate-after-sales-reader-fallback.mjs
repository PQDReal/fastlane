import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const INPUT = path.join(ROOT, '.local', 'after-sales', 'transformed-extracted.json')
const OUTPUT = path.join(ROOT, '.local', 'after-sales', 'transformed-validation-report.json')
const data = JSON.parse(fs.readFileSync(INPUT, 'utf8'))
const errors = []
const warnings = []
for (const record of data.records || []) {
  if (!/(^|\.)vinfastauto\.com$/iu.test(new URL(record.sourceUrl).hostname)) errors.push(`${record.sourceId}: source URL is not official`)
  if (record.captureMethod !== 'jina_reader') errors.push(`${record.sourceId}: unexpected transformed capture method`)
  if (!/^sha256:[a-f0-9]{64}$/iu.test(record.contentHash || '')) errors.push(`${record.sourceId}: invalid content hash`)
  if ((record.text || '').length < 500) errors.push(`${record.sourceId}: transformed content is too short`)
  if (/HDSD xe|HƯỚNG DẪN SỬ DỤNG XE|\/tai-lieu-(?:o-to|xe-may-dien|ebus)|\/hdsd\//iu.test(record.text || '')) {
    errors.push(`${record.sourceId}: out-of-scope owner-manual content leaked into transformed extraction`)
  }
  if (record.evidenceAnchor?.rawDomVerified !== false || record.publicationEligible !== false) {
    errors.push(`${record.sourceId}: transformed source must remain publication-blocked`)
  }
  warnings.push(`${record.sourceId}: reader text requires raw browser recapture or an explicit admin exception before publication`)
}
if (data.publicationStatus !== 'blocked_pending_raw_recapture_and_admin_review') errors.push('Invalid transformed dataset publication status')
const report = {
  checkedAt: new Date().toISOString(),
  summary: { records: data.records?.length || 0, errors: errors.length, warnings: warnings.length },
  errors,
  warnings,
  decision: errors.length ? 'REJECT' : 'PRE_REVIEW_STAGED',
  nextGate: 'ADMIN_REVIEW_WITH_PUBLICATION_BLOCK',
}
fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(report, null, 2))
if (errors.length) process.exitCode = 1
