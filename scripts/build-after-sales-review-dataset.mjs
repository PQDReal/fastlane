import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildReviewDatasetFromFiles } from './lib/after-sales-review-dataset.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(ROOT, '.local/after-sales/review-dataset.json')
const normalizedPath = process.argv.find(argument => argument.startsWith('--normalized='))?.slice('--normalized='.length)
const dataset = buildReviewDatasetFromFiles({
  root: ROOT,
  existingPath: output,
  normalizedPath: normalizedPath ? path.resolve(normalizedPath) : null,
})
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({
  output,
  sources: dataset.sourceCount,
  facts: dataset.factCount,
  evidence: dataset.evidenceCount,
  pending: dataset.pendingCount,
  approved: dataset.approvedCount,
  rejected: dataset.rejectedCount,
}, null, 2))
