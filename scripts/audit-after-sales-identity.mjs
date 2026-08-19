import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { semanticIdentityFingerprint, semanticIdentitySnapshot } from './lib/after-sales-persistence-audit.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const extractedPath = path.join(ROOT, 'public/data/after-sales-extracted.json')
const normalizerPath = path.join(ROOT, 'scripts/normalize-after-sales-facts.mjs')
const reportPath = path.join(ROOT, '.local/after-sales/identity-stability-report.json')
const extracted = JSON.parse(fs.readFileSync(extractedPath, 'utf8'))
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'after-sales-identity-'))

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function runNormalizer(label, input) {
  const inputPath = path.join(tempRoot, `${label}-input.json`)
  const outputPath = path.join(tempRoot, `${label}-normalized.json`)
  fs.writeFileSync(inputPath, `${JSON.stringify(input)}\n`)
  const result = spawnSync(process.execPath, [normalizerPath, `--input=${inputPath}`, `--output=${outputPath}`], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  })
  if (result.status !== 0) throw new Error(`${label} normalization failed: ${result.stderr || result.stdout}`)
  return JSON.parse(fs.readFileSync(outputPath, 'utf8'))
}

const runs = []
for (let index = 1; index <= 3; index++) runs.push({ label: `same_snapshot_${index}`, data: runNormalizer(`same-${index}`, clone(extracted)) })

const reordered = clone(extracted)
reordered.records.reverse()
for (const source of reordered.records || []) source.assets = [...(source.assets || [])].reverse()
const reorderedData = runNormalizer('reordered-input', reordered)

const refreshed = clone(extracted)
for (const source of refreshed.records || []) {
  source.capturedAt = new Date(Date.parse(source.capturedAt) + 60 * 60 * 1000).toISOString()
  source.snapshotId = `${source.sourceId}-refresh-metadata-only`
}
const refreshedData = runNormalizer('metadata-refresh', refreshed)

const baselineFingerprint = semanticIdentityFingerprint(runs[0].data)
const sameSnapshotStable = runs.every(run => semanticIdentityFingerprint(run.data) === baselineFingerprint)
const reorderedStable = semanticIdentityFingerprint(reorderedData) === baselineFingerprint
const metadataRefreshStable = semanticIdentityFingerprint(refreshedData) === baselineFingerprint
const baselineIdentity = semanticIdentitySnapshot(runs[0].data)

const output = {
  auditVersion: 'after-sales-identity-stability-v1',
  auditedAt: new Date().toISOString(),
  facts: baselineIdentity.length,
  evidence: baselineIdentity.reduce((sum, fact) => sum + fact.evidenceIds.length, 0),
  semanticIdentityFingerprint: baselineFingerprint,
  checks: {
    sameSnapshotThreeRuns: sameSnapshotStable,
    reorderedRecordsAndAssets: reorderedStable,
    metadataOnlyRefresh: metadataRefreshStable,
  },
  comparedFields: ['factId', 'canonicalKey', 'factGroupId', 'intervalGroupId', 'evidenceIds'],
  decision: sameSnapshotStable && reorderedStable && metadataRefreshStable ? 'PASS' : 'REVIEW',
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true })
fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`)
fs.rmSync(tempRoot, { recursive: true, force: true })
console.log(JSON.stringify(output, null, 2))
if (output.decision !== 'PASS') process.exitCode = 1

