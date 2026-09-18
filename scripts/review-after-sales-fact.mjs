import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyApprovalCommand } from './lib/after-sales-approval.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const datasetPath = path.resolve(process.argv.find(argument => argument.startsWith('--dataset='))?.slice('--dataset='.length) || path.join(ROOT, '.local/after-sales/review-dataset.json'))
const factId = process.argv.find(argument => argument.startsWith('--fact-id='))?.slice('--fact-id='.length)
const status = process.argv.find(argument => argument.startsWith('--status='))?.slice('--status='.length)
const reviewerId = process.argv.find(argument => argument.startsWith('--reviewer-id='))?.slice('--reviewer-id='.length)
const note = process.argv.find(argument => argument.startsWith('--note='))?.slice('--note='.length)

if (!factId || !status || !reviewerId) {
  throw new Error('Required: --fact-id=... --status=pending|approved|rejected --reviewer-id=... [--note=...]')
}
if (!fs.existsSync(datasetPath)) throw new Error(`Review dataset not found: ${datasetPath}`)

const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'))
const fact = dataset.facts.find(item => item.factId === factId)
if (!fact) throw new Error(`Fact not found: ${factId}`)

const result = applyApprovalCommand(fact.approval, { status, reviewerId, note })
fact.approval = result.current
fact.sourceReviewStatus = result.current.status
dataset.pendingCount = dataset.facts.filter(item => item.approval.status === 'pending').length
dataset.approvedCount = dataset.facts.filter(item => item.approval.status === 'approved').length
dataset.rejectedCount = dataset.facts.filter(item => item.approval.status === 'rejected').length
dataset.updatedAt = new Date().toISOString()

const historyPath = path.join(ROOT, '.local/after-sales/approval-history.jsonl')
fs.mkdirSync(path.dirname(datasetPath), { recursive: true })
fs.mkdirSync(path.dirname(historyPath), { recursive: true })
fs.writeFileSync(datasetPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8')
fs.appendFileSync(historyPath, `${JSON.stringify({ factId, ...result.history })}\n`, 'utf8')
console.log(JSON.stringify({ factId, approval: fact.approval, dataset: datasetPath, history: historyPath }, null, 2))
