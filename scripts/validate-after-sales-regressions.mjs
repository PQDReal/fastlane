import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const inputPath = path.join(ROOT, 'public', 'data', 'after-sales-normalized.json')
const reportPath = path.join(ROOT, '.local', 'after-sales', 'regression-report.json')
const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
const facts = data.facts || []
const failures = []

function expectFact(name, predicate) {
  if (!facts.some(predicate)) failures.push(`${name}: expected fact not found`)
}

function rejectFact(name, predicate) {
  const matching = facts.filter(predicate)
  if (matching.length) failures.push(`${name}: found ${matching.length} forbidden fact(s): ${matching.map(fact => fact.factId).join(', ')}`)
}

expectFact('hyphenated accumulator duration', fact =>
  fact.subject === 'battery_12v'
  && fact.factType === 'battery_12v_warranty_duration'
  && fact.model === null
  && fact.valueNumeric === 1
  && fact.unit === 'year')
expectFact('hyphenated accumulator distance', fact =>
  fact.subject === 'battery_12v'
  && fact.factType === 'battery_12v_warranty_distance'
  && fact.model === null
  && fact.valueNumeric === 20000
  && fact.unit === 'km')
rejectFact('accumulator must not become high-voltage battery', fact =>
  fact.subject === 'battery'
  && fact.model === null
  && ((fact.valueNumeric === 1 && fact.unit === 'year') || (fact.valueNumeric === 20000 && fact.unit === 'km')))

expectFact('cross-page suspension heading', fact =>
  fact.model === 'VF 3'
  && fact.subject === 'suspension'
  && fact.valueNumeric === 5
  && fact.unit === 'year'
  && fact.provenances.some(provenance => provenance.pdfPage === 10))
expectFact('cross-page accessory heading', fact =>
  fact.model === 'VF 3'
  && fact.subject === 'accessory'
  && fact.valueNumeric === 2
  && fact.unit === 'year'
  && fact.provenances.some(provenance => provenance.pdfPage === 11))

expectFact('thousands separator preserves model sentence', fact =>
  fact.model === 'Fadil'
  && fact.subject === 'engine_air_filter'
  && fact.action === 'replace'
  && fact.valueNumeric === 15000
  && fact.unit === 'km')
expectFact('general maintenance does not inherit nearby component', fact =>
  fact.sourceId === 'vinfast-maintenance-car'
  && fact.subject === 'vehicle'
  && fact.model === null
  && fact.action === 'scheduled_service'
  && fact.valueNumeric === 12000
  && fact.unit === 'km')

expectFact('inspect clause stays inspect', fact =>
  fact.model === 'VF e34'
  && fact.subject === 'battery_coolant'
  && fact.action === 'inspect'
  && fact.valueNumeric === 12000
  && fact.unit === 'km')
expectFact('replace clause stays replace', fact =>
  fact.model === 'VF e34'
  && fact.subject === 'battery_coolant'
  && fact.action === 'replace'
  && fact.valueNumeric === 120
  && fact.unit === 'month')
expectFact('lexical yearly interval is normalized', fact =>
  fact.model === 'VF e34'
  && fact.subject === 'battery_coolant'
  && fact.action === 'inspect'
  && fact.valueNumeric === 1
  && fact.unit === 'year'
  && fact.intervalRelation === 'or')
expectFact('same-action alternatives share an interval group', fact =>
  fact.model === 'VF e34'
  && fact.subject === 'battery_coolant'
  && fact.action === 'inspect'
  && fact.intervalRelation === 'or'
  && fact.intervalGroupId
  && fact.groupSemanticFlags?.includes('MULTI_ACTION_CLAUSE')
  && facts.some(other => other !== fact && other.model === fact.model && other.subject === fact.subject && other.action === fact.action && other.intervalGroupId === fact.intervalGroupId && other.valueNumeric !== fact.valueNumeric))
expectFact('temporal interval keeps group policy separate', fact =>
  fact.model === 'VF e34'
  && fact.subject === 'battery_coolant'
  && fact.action === 'inspect'
  && fact.unit === 'year'
  && fact.distancePolicy === 'not_stated'
  && fact.intervalGroupDistancePolicy === 'limited')
rejectFact('temporal interval must not inherit distance policy from counterpart', fact =>
  fact.model === 'VF e34'
  && fact.subject === 'battery_coolant'
  && fact.action === 'inspect'
  && fact.unit === 'year'
  && fact.distancePolicy === 'limited')

// New semantic invariants from expert review
expectFact('VF 8 and VF 8 The All New co-exist without dropping plain VF 8', fact =>
  fact.model === 'VF 8'
  && fact.subject === 'vehicle'
  && fact.valueNumeric === 10
  && fact.unit === 'year')
expectFact('VF 8 The All New exists as separate entity', fact =>
  fact.model === 'VF 8 The All New'
  && fact.subject === 'vehicle'
  && fact.valueNumeric === 7
  && fact.unit === 'year')

expectFact('VF 3 accessory unlimited distance', fact =>
  fact.model === 'VF 3'
  && fact.subject === 'accessory'
  && fact.distancePolicy === 'unlimited')
expectFact('Minio Green 12V battery unlimited distance', fact =>
  fact.model === 'VF Minio Green'
  && fact.subject === 'battery_12v'
  && fact.distancePolicy === 'unlimited')

expectFact('VF 7 emergency safety wait time model specific', fact =>
  fact.model === 'VF 7'
  && fact.factType === 'emergency_safety_wait_time'
  && fact.valueNumeric === 5)

const factGroupSubjects = new Map()
for (const fact of facts) {
  if (!factGroupSubjects.has(fact.factGroupId)) factGroupSubjects.set(fact.factGroupId, new Set())
  factGroupSubjects.get(fact.factGroupId).add(fact.subject)
}
for (const [groupId, subjects] of factGroupSubjects) {
  if (subjects.size > 1) {
    failures.push(`fact group ${groupId} crosses subjects: ${[...subjects].join(', ')}`)
  }
}

const intervalGroupScopes = new Map()
for (const fact of facts) {
  if (fact.intervalGroupId) {
    if (!intervalGroupScopes.has(fact.intervalGroupId)) intervalGroupScopes.set(fact.intervalGroupId, new Set())
    intervalGroupScopes.get(fact.intervalGroupId).add(`${fact.subject}|${fact.applicability}`)
  }
}
for (const [intervalId, scopes] of intervalGroupScopes) {
  if (scopes.size > 1) {
    failures.push(`interval group ${intervalId} crosses scopes: ${[...scopes].join(', ')}`)
  }
}

const usageGroups = new Map()
for (const fact of facts.filter(item => item.serviceType === 'warranty')) {
  const key = [fact.vehicleType, fact.powertrain, fact.model || 'all_models', fact.subject, fact.applicability, fact.action, fact.factType, fact.valueNumeric, fact.unit, fact.distancePolicy, fact.qualifier || ''].join('|')
  if (!usageGroups.has(key)) usageGroups.set(key, new Set())
  usageGroups.get(key).add(fact.usageCondition)
}
for (const [key, usages] of usageGroups) {
  if (usages.has('general') && usages.has('standard_use')) failures.push(`unreconciled general/standard alias: ${key}`)
}

rejectFact('phone/address numbers must not produce currency', fact => fact.unit === 'VND')
rejectFact('percentage must use controlled semantic type', fact =>
  fact.unit === 'percent' && !['battery_capacity_threshold', 'coverage_percentage'].includes(fact.factType))

const pdfProvenances = facts.flatMap(fact => fact.provenances || []).filter(provenance => provenance.extractionMethod === 'pdf_text_layer')
if (!pdfProvenances.length) failures.push('PDF page provenance: no PDF evidence found')
if (pdfProvenances.some(provenance => !Number.isInteger(provenance.pdfPage) || provenance.pdfPage < 1)) {
  failures.push('PDF page provenance: one or more evidence rows lack a valid pdfPage')
}

const report = {
  validatorVersion: 'after-sales-regressions-v1',
  checkedAt: new Date().toISOString(),
  assertions: 22,
  facts: facts.length,
  pdfProvenances: pdfProvenances.length,
  failures,
  decision: failures.length ? 'REJECT' : 'PASS',
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true })
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if (failures.length) process.exitCode = 1
