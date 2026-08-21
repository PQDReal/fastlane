import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditSnapshotInventory } from './lib/after-sales-snapshot-inventory.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SNAPSHOT_ROOT = path.join(ROOT, '.local', 'after-sales', 'snapshots')
const REPORT_FILE = path.join(ROOT, '.local', 'after-sales', 'snapshot-inventory-report.json')

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function inventorySnapshot(snapshot) {
  return {
    snapshotId: snapshot?.snapshotId || null,
    sourceId: snapshot?.sourceId || null,
    sourceUrl: snapshot?.sourceUrl || null,
    capturedAt: snapshot?.capturedAt || null,
    captureMethod: snapshot?.captureMethod || null,
    httpStatus: snapshot?.httpStatus ?? null,
    availability: snapshot?.availability || null,
    rawSnapshotVersion: snapshot?.rawSnapshotVersion || null,
    rawDomTextHash: snapshot?.rawDomTextHash || null,
    rawDomHtmlHash: snapshot?.rawDomHtmlHash || null,
    latestRetained: snapshot?.latestRetained === true,
    acquisitionFailureCount: (snapshot?.acquisitionFailures || []).length,
  }
}

function readSnapshotEntries() {
  if (!fs.existsSync(SNAPSHOT_ROOT)) return []
  return fs.readdirSync(SNAPSHOT_ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const directory = path.join(SNAPSHOT_ROOT, entry.name)
      const latestFile = path.join(directory, 'latest.json')
      const history = fs.readdirSync(directory, { withFileTypes: true })
        .filter(file => file.isFile() && file.name.endsWith('.json') && file.name !== 'latest.json')
        .map(file => {
          const historicalFile = path.join(directory, file.name)
          try {
            return { fileName: file.name, snapshot: inventorySnapshot(readJson(historicalFile)) }
          } catch (error) {
            return { fileName: file.name, readError: error.message }
          }
        })
      if (!fs.existsSync(latestFile)) {
        return { sourceId: entry.name, latestFile, history, readError: 'missing latest.json' }
      }
      try {
        return { sourceId: entry.name, latestFile, history, snapshot: inventorySnapshot(readJson(latestFile)) }
      } catch (error) {
        return { sourceId: entry.name, latestFile, history, readError: error.message }
      }
    })
}

const report = auditSnapshotInventory({
  manifest: readJson(path.join(ROOT, 'scripts', 'data', 'after-sales-source-manifest.json')),
  dispositions: readJson(path.join(ROOT, 'scripts', 'data', 'after-sales-snapshot-dispositions.json')),
  snapshotEntries: readSnapshotEntries(),
  verifiedRecords: (readJson(path.join(ROOT, 'public', 'data', 'after-sales-verified.json')).records || [])
    .map(record => ({
      sourceId: record.sourceId,
      sourceUrl: record.sourceUrl,
      snapshotId: record.snapshotId,
    })),
})

const output = {
  checkedAt: new Date().toISOString(),
  ...report,
}
fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true })
fs.writeFileSync(REPORT_FILE, `${JSON.stringify(output, null, 2)}\n`)
const consoleOutput = process.argv.includes('--summary')
  ? {
      checkedAt: output.checkedAt,
      auditorVersion: output.auditorVersion,
      summary: output.summary,
      excluded: output.excluded.map(item => ({ sourceId: item.sourceId, reasonCode: item.reasonCode })),
      superseded: output.superseded.map(item => ({
        sourceId: item.sourceId,
        canonicalSourceId: item.canonicalSourceId,
        reasonCode: item.reasonCode,
      })),
      unknown: output.unknown,
      errors: output.errors,
      warnings: output.warnings,
      decision: output.decision,
    }
  : output
console.log(JSON.stringify(consoleOutput, null, 2))
if (output.decision === 'REJECT') process.exitCode = 1
