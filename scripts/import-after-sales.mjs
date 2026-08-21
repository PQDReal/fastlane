import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildImportPlan } from './lib/after-sales-importer.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dryRun = process.argv.includes('--dry-run')
const allowPendingReviewPlan = process.argv.includes('--allow-pending-review-plan')
const datasetPath = path.resolve(process.argv.find(argument => argument.startsWith('--dataset='))?.slice('--dataset='.length) || path.join(ROOT, '.local/after-sales/review-dataset.json'))
const existingPath = process.argv.find(argument => argument.startsWith('--existing='))?.slice('--existing='.length)
const existing = existingPath && fs.existsSync(path.resolve(existingPath))
  ? JSON.parse(fs.readFileSync(path.resolve(existingPath), 'utf8'))
  : {}

if (!fs.existsSync(datasetPath)) throw new Error(`Review dataset not found: ${datasetPath}. Run npm run build:after-sales-review first.`)
const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'))
const plan = buildImportPlan(dataset, existing, { requireApproved: !allowPendingReviewPlan })
const report = {
  generatedAt: new Date().toISOString(),
  mode: dryRun ? 'dry-run' : 'blocked',
  dataset: datasetPath,
  ...plan,
}
const reportPath = path.join(ROOT, '.local/after-sales/import-report.json')
fs.mkdirSync(path.dirname(reportPath), { recursive: true })
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({
  mode: report.mode,
  approvalPolicy: report.approvalPolicy,
  sources: report.summary.sources,
  assets: report.summary.assets,
  facts: report.summary.facts,
  evidence: report.summary.evidence,
  approvals: report.summary.approvals,
  conflicts: report.conflicts.length,
  rejectedWrites: report.rejectedWrites.length,
  writes: report.writes,
  decision: report.decision,
}, null, 2))

if (!dryRun) {
  throw new Error('Supabase writes are intentionally disabled in this phase. Run with --dry-run; production importer requires a separately approved write adapter.')
}
if (plan.decision !== 'READY') process.exitCode = 1
