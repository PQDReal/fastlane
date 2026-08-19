import fs from 'node:fs'
import path from 'node:path'
import { buildReviewDatasetFromFiles } from './lib/after-sales-review-dataset.mjs'
import { buildImportPlan } from './lib/after-sales-importer.mjs'
import {
  classifyFactLifecycle,
  detectSemanticConflicts,
  semanticScopeKey,
  validateImportRelationships,
} from './lib/after-sales-persistence-audit.mjs'

const ROOT = process.cwd()
const reportPath = path.join(ROOT, '.local/after-sales/persistence-hardening-report.json')

const clone = value => JSON.parse(JSON.stringify(value))
const tableRows = plan => Object.fromEntries(Object.entries(plan.tables).map(([table, value]) => [
  table,
  value.rows.map(entry => entry.row),
]))

function assertCheck(checks, name, passed, details = null) {
  checks.push({ name, passed: Boolean(passed), details })
}

function pickUniqueScopeFact(facts) {
  const counts = new Map()
  for (const fact of facts) {
    const key = semanticScopeKey(fact)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return facts.find(fact => counts.get(semanticScopeKey(fact)) === 1) || facts[0]
}

function pickMultiScopeFact(facts) {
  const counts = new Map()
  for (const fact of facts) {
    const key = semanticScopeKey(fact)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return facts.find(fact => counts.get(semanticScopeKey(fact)) > 1) || facts[0]
}

function replaceFactValue(fact, valueNumeric) {
  const canonicalKey = fact.canonicalKey.replace(
    `|${fact.valueNumeric}|${fact.unit}|`,
    `|${valueNumeric}|${fact.unit}|`,
  )
  return {
    ...fact,
    factId: `${fact.factId}_replacement`,
    canonicalKey,
    valueNumeric,
    valueText: `${valueNumeric} ${fact.unit}`,
    factGroupId: `${fact.factGroupId}_replacement`,
  }
}

const dataset = buildReviewDatasetFromFiles({ root: ROOT })
const emptyPlan = buildImportPlan(dataset)
const existing = tableRows(emptyPlan)
const idempotentPlan = buildImportPlan(dataset, existing)

const refreshed = clone(dataset)
const refreshAt = '2026-08-19T07:00:00.000Z'
for (const source of refreshed.sources) {
  source.snapshotId = `${source.snapshotId || source.sourceId}-metadata-refresh`
  source.capturedAt = refreshAt
}
for (const fact of refreshed.facts) {
  for (const evidence of fact.evidence) evidence.capturedAt = refreshAt
}
const refreshedPlan = buildImportPlan(refreshed, existing)

const lifecycleTarget = pickUniqueScopeFact(existing.facts)
const normalizedLifecycleTarget = dataset.facts.find(fact => fact.factId === lifecycleTarget.fact_id) || dataset.facts[0]
const deletedDataset = clone(dataset)
deletedDataset.facts = deletedDataset.facts.filter(fact => fact.factId !== lifecycleTarget.fact_id)
deletedDataset.factCount = deletedDataset.facts.length
deletedDataset.evidenceCount = deletedDataset.facts.reduce((sum, fact) => sum + fact.evidence.length, 0)
const deletionPlan = buildImportPlan(deletedDataset, existing)

const replacement = replaceFactValue(normalizedLifecycleTarget, Number(normalizedLifecycleTarget.valueNumeric || 0) + 1)
const supersededDataset = clone(dataset)
supersededDataset.facts = supersededDataset.facts.map(fact => fact.factId === lifecycleTarget.fact_id ? replacement : fact)
supersededDataset.factCount = supersededDataset.facts.length
const supersededPlan = buildImportPlan(supersededDataset, existing)

const ambiguousTarget = pickMultiScopeFact(existing.facts)
const normalizedAmbiguousTarget = dataset.facts.find(fact => fact.factId === ambiguousTarget.fact_id) || dataset.facts[0]
const ambiguousReplacement = replaceFactValue(normalizedAmbiguousTarget, Number(normalizedAmbiguousTarget.valueNumeric || 0) + 1)
const ambiguousDataset = clone(dataset)
ambiguousDataset.facts = ambiguousDataset.facts.map(fact => fact.factId === ambiguousTarget.fact_id ? ambiguousReplacement : fact)
ambiguousDataset.factCount = ambiguousDataset.facts.length
const ambiguousPlan = buildImportPlan(ambiguousDataset, existing)

const approvedExisting = clone(existing)
approvedExisting.facts = approvedExisting.facts.map(fact => fact.fact_id === lifecycleTarget.fact_id
  ? {
      ...fact,
      approval_status: 'approved',
      reviewer_id: 'hardening-audit',
      reviewed_at: refreshAt,
      approved_by: 'hardening-audit',
      approved_at: refreshAt,
      approval_note: 'Synthetic hardening audit approval.',
    }
  : fact)
const approvalInvalidationPlan = buildImportPlan(supersededDataset, approvedExisting)
const replacementRow = approvalInvalidationPlan.tables.facts.rows.find(entry => entry.row.fact_id === replacement.factId)?.row

const conflictBase = clone(normalizedLifecycleTarget)
const conflictOther = replaceFactValue(normalizedLifecycleTarget, Number(normalizedLifecycleTarget.valueNumeric || 0) + 1)
const conflictFindings = detectSemanticConflicts([conflictBase, conflictOther])
const currentConflictFindings = detectSemanticConflicts(dataset.facts)

const checks = []
assertCheck(checks, 'empty_import_ready', emptyPlan.decision === 'READY' && emptyPlan.writes === 0, {
  decision: emptyPlan.decision,
  summary: emptyPlan.summary,
})
assertCheck(checks, 'empty_import_fk_provenance', validateImportRelationships(emptyPlan).length === 0)
assertCheck(checks, 'second_import_idempotent',
  idempotentPlan.summary.facts.inserts === 0
  && idempotentPlan.summary.facts.updates === 0
  && idempotentPlan.summary.facts.unchanged === dataset.factCount
  && idempotentPlan.summary.evidence.unchanged === dataset.evidenceCount,
  { summary: idempotentPlan.summary },
)
assertCheck(checks, 'metadata_refresh_keeps_semantic_rows',
  refreshedPlan.summary.facts.inserts === 0
  && refreshedPlan.summary.facts.updates === 0
  && refreshedPlan.summary.facts.unchanged === dataset.factCount
  && refreshedPlan.summary.sources.updates === dataset.sourceCount
  && refreshedPlan.summary.evidence.updates === dataset.evidenceCount,
  { summary: refreshedPlan.summary },
)
assertCheck(checks, 'deletion_requires_review_without_delete_write',
  deletionPlan.decision === 'REVIEW'
  && deletionPlan.lifecycle.summary.noLongerObserved === 1
  && deletionPlan.lifecycle.summary.superseded === 0
  && !Object.values(deletionPlan.tables).some(table => table.rows.some(entry => entry.action === 'delete')),
  { lifecycle: deletionPlan.lifecycle.summary, decision: deletionPlan.decision },
)
assertCheck(checks, 'changed_value_is_superseded',
  supersededPlan.decision === 'REVIEW'
  && supersededPlan.lifecycle.summary.superseded === 1
  && supersededPlan.lifecycle.summary.noLongerObserved === 0,
  { lifecycle: supersededPlan.lifecycle.summary },
)
assertCheck(checks, 'ambiguous_changed_value_requires_review',
  ambiguousPlan.decision === 'REVIEW'
  && ambiguousPlan.lifecycle.summary.ambiguousSupersession === 1
  && ambiguousPlan.lifecycle.summary.superseded === 0,
  { lifecycle: ambiguousPlan.lifecycle.summary },
)
assertCheck(checks, 'approved_fact_change_returns_pending',
  approvalInvalidationPlan.lifecycle.summary.superseded === 1
  && replacementRow?.approval_status === 'pending',
  { replacementFactId: replacement.factId, approvalStatus: replacementRow?.approval_status },
)
assertCheck(checks, 'contradiction_detector_flags_independent_values',
  conflictFindings.length === 1 && conflictFindings[0].type === 'SEMANTIC_CONFLICT',
  conflictFindings,
)
assertCheck(checks, 'current_dataset_has_no_contradictions', currentConflictFindings.length === 0, currentConflictFindings)

const output = {
  auditVersion: 'after-sales-persistence-hardening-v1',
  auditedAt: new Date().toISOString(),
  dataset: {
    sources: dataset.sourceCount,
    assets: dataset.assetCount,
    facts: dataset.factCount,
    evidence: dataset.evidenceCount,
  },
  lifecycle: {
    secondImport: idempotentPlan.lifecycle.summary,
    deletionProbe: deletionPlan.lifecycle.summary,
    supersessionProbe: supersededPlan.lifecycle.summary,
    ambiguousSupersessionProbe: ambiguousPlan.lifecycle.summary,
  },
  contradictionProbe: {
    syntheticFindings: conflictFindings,
    currentDatasetFindings: currentConflictFindings,
  },
  checks,
  decision: checks.every(check => check.passed) ? 'PASS' : 'REVIEW',
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true })
fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({
  decision: output.decision,
  checks: checks.length,
  passed: checks.filter(check => check.passed).length,
  dataset: output.dataset,
  lifecycle: output.lifecycle,
  contradictionProbe: {
    syntheticFindings: conflictFindings.length,
    currentDatasetFindings: currentConflictFindings.length,
  },
}, null, 2))

if (output.decision !== 'PASS') process.exitCode = 1
