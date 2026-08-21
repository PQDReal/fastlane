import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = path.join(root, 'scripts', 'data', 'after-sales-source-manifest.json')
const data = JSON.parse(fs.readFileSync(file, 'utf8'))
const errors = []
const warnings = []
const ids = new Set()
const sourceIds = new Set((data.sources || []).map(source => source.id))

for (const source of data.sources || []) {
  if (!source.id || ids.has(source.id)) errors.push(`missing or duplicate source id: ${source.id || '(missing)'}`)
  ids.add(source.id)
  for (const field of ['serviceType', 'vehicleType', 'url', 'availability', 'relevancy', 'accuracy']) {
    if (!source[field]) errors.push(`${source.id || '(missing)'}: missing ${field}`)
  }
  if (!source.scope || !Array.isArray(source.scope.vehicleTypes) || !source.scope.vehicleTypes.length) {
    errors.push(`${source.id}: missing scope.vehicleTypes`)
  }
  if (source.scope?.vehicleTypes?.includes('motorbike') && source.vehicleType === 'car') {
    errors.push(`${source.id}: vehicleType=car conflicts with scope.vehicleTypes`)
  }
  try {
    const hostname = new URL(source.url).hostname
    if (!/(^|\.)vinfastauto\.com$/i.test(hostname) || !/^https:\/\//i.test(source.url)) errors.push(`${source.id}: non-official URL`)
  } catch { errors.push(`${source.id}: invalid URL`) }
  if (source.accuracy === 'pending_manual_review') warnings.push(`${source.id}: pending accuracy review`)
}

for (const fact of data.transcribedFacts || []) {
  if (!sourceIds.has(fact.sourceId)) errors.push(`fact references unknown source: ${fact.sourceId}`)
  if (fact.reviewStatus !== 'pending_admin_review') warnings.push(`fact is not pending admin review: ${fact.sourceId}`)
  const source = data.sources.find(item => item.id === fact.sourceId)
  if (source && !source.scope.vehicleTypes.includes(fact.vehicleType)) {
    errors.push(`fact vehicleType is outside source scope: ${fact.sourceId}`)
  }
  if (!Array.isArray(fact.vehicleModels) || !fact.vehicleModels.length) {
    errors.push(`fact has no vehicleModels: ${fact.sourceId}`)
  }
}

const report = {
  checkedAt: new Date().toISOString(),
  summary: { sources: data.sources?.length || 0, facts: data.transcribedFacts?.length || 0, errors: errors.length, warnings: warnings.length },
  errors,
  warnings,
  decision: errors.length ? 'REJECT' : warnings.length ? 'REVIEW' : 'PASS',
}
const output = path.join(root, '.local', 'after-sales', 'manifest-validation-report.json')
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if (errors.length) process.exitCode = 1
