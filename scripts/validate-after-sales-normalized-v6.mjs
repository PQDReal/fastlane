import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectSemanticConflicts } from './lib/after-sales-persistence-audit.mjs'
import { validateRawEvidence } from './lib/after-sales-raw-evidence-validator.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const inputPath = path.resolve(
  process.argv.find(argument => argument.startsWith('--input='))?.slice('--input='.length)
    || path.join(ROOT, '.local/after-sales/after-sales-normalized-v6.json'),
)
const outputPath = path.join(ROOT, '.local/after-sales/normalized-v6-validation-report.json')

const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
const errors = []
const warnings = []
const factIds = new Set()
const canonicalKeys = new Set()
const allowedReviewStatuses = new Set(['pending', 'pending_admin_review', 'needs_review', 'approved', 'rejected'])
const allowedSemanticFlags = new Set(['SOURCE_SCOPE_CONFLICT', 'ACTION_BINDING_AMBIGUOUS', 'NON_NUMERIC_ALTERNATIVE_TRIGGER', 'UNRESOLVED_MODEL_ALIAS', 'PROMOTION_SCOPED'])

if (data.schemaVersion !== 6) errors.push(`schemaVersion must be 6, got ${data.schemaVersion}`)
if (!['hold_raw_recrawl_required', 'pending_admin_approval'].includes(data.publicationStatus)) {
  errors.push(`publicationStatus must remain pre-publication, got ${data.publicationStatus}`)
}
if (!Array.isArray(data.facts)) errors.push('facts must be an array')

for (const fact of data.facts || []) {
  if (!fact.factId) errors.push('fact is missing factId')
  if (factIds.has(fact.factId)) errors.push(`duplicate factId: ${fact.factId}`)
  factIds.add(fact.factId)

  if (!fact.canonicalKey) errors.push(`${fact.factId}: missing canonicalKey`)
  if (canonicalKeys.has(fact.canonicalKey)) errors.push(`duplicate canonicalKey: ${fact.canonicalKey}`)
  canonicalKeys.add(fact.canonicalKey)

  if (!allowedReviewStatuses.has(fact.reviewStatus)) {
    errors.push(`${fact.factId}: invalid reviewStatus ${fact.reviewStatus}`)
  }
  if (!Array.isArray(fact.semanticFlags)) errors.push(`${fact.factId}: semanticFlags must be an array`)
  for (const flag of fact.semanticFlags || []) {
    if (!allowedSemanticFlags.has(flag)) errors.push(`${fact.factId}: invalid semantic flag ${flag}`)
  }
  if (!Array.isArray(fact.alternativeTriggers)) errors.push(`${fact.factId}: alternativeTriggers must be an array`)
  const alternativeTriggerCodes = new Set()
  for (const [index, trigger] of (fact.alternativeTriggers || []).entries()) {
    if (trigger?.type !== 'event') errors.push(`${fact.factId}: alternativeTriggers[${index}] must have type event`)
    if (!trigger?.code || typeof trigger.code !== 'string') errors.push(`${fact.factId}: alternativeTriggers[${index}] is missing code`)
    if (!trigger?.sourceText || typeof trigger.sourceText !== 'string') errors.push(`${fact.factId}: alternativeTriggers[${index}] is missing sourceText`)
    if (alternativeTriggerCodes.has(trigger?.code)) errors.push(`${fact.factId}: duplicate alternative trigger code ${trigger.code}`)
    alternativeTriggerCodes.add(trigger?.code)
  }
  const hasAlternativeTriggerFlag = (fact.semanticFlags || []).includes('NON_NUMERIC_ALTERNATIVE_TRIGGER')
  if (hasAlternativeTriggerFlag && !(fact.alternativeTriggers || []).length) errors.push(`${fact.factId}: non-numeric alternative flag has no structured trigger`)
  if (!hasAlternativeTriggerFlag && (fact.alternativeTriggers || []).length) errors.push(`${fact.factId}: structured alternative trigger is missing semantic flag`)
  if (!Array.isArray(fact.provenances) || fact.provenances.length === 0) {
    errors.push(`${fact.factId}: missing provenance`) 
    continue
  }
  if (fact.evidenceCount !== fact.provenances.length) {
    errors.push(`${fact.factId}: evidenceCount does not match provenances`)
  }
  if (!fact.provenance || JSON.stringify(fact.provenance) !== JSON.stringify(fact.provenances[0])) {
    warnings.push(`${fact.factId}: legacy provenance alias differs from first provenance`)
  }

  for (const provenance of fact.provenances) {
    if (!provenance.sourceUrl) errors.push(`${fact.factId}: provenance missing sourceUrl`)
    if (!provenance.sourceId) errors.push(`${fact.factId}: provenance missing sourceId`)
    if (!provenance.sourceValueText) errors.push(`${fact.factId}: provenance missing sourceValueText`)
    if (!provenance.excerpt) errors.push(`${fact.factId}: provenance missing excerpt`)
    if (provenance.origin !== 'manifest_transcription') {
      const contextIndex = provenance.contextIndex
      if (!contextIndex) errors.push(`${fact.factId}: extracted evidence missing contextIndex`)
      if (contextIndex?.version !== 'after-sales-evidence-context-v2') {
        errors.push(`${fact.factId}: extracted evidence must use contextIndex v2`)
      }
    }
  }
}

const rawEvidence = fs.existsSync(path.join(ROOT, 'public/data/after-sales-extracted.json'))
  ? validateRawEvidence({
      facts: data.facts || [],
      snapshotsRoot: path.join(ROOT, '.local/after-sales/snapshots'),
      extractedPath: path.join(ROOT, 'public/data/after-sales-extracted.json'),
    })
  : { machineEvidence: 0, rawAnchoredEvidence: 0, unverifiedEvidence: 0, errors: ['missing extracted raw-source data'], valid: false }
errors.push(...rawEvidence.errors)
if (data.normalizationBasis?.rawCorpusAvailable !== rawEvidence.valid) {
  errors.push(`normalizationBasis.rawCorpusAvailable does not match raw evidence validation (${rawEvidence.valid})`)
}
const expectedPublicationStatus = rawEvidence.valid ? 'pending_admin_approval' : 'hold_raw_recrawl_required'
if (data.publicationStatus !== expectedPublicationStatus) {
  errors.push(`publicationStatus must be ${expectedPublicationStatus} for the current raw evidence state`)
}

if ((data.summary?.factsNeedingReview || 0) !== (data.facts || []).filter(fact => fact.reviewStatus === 'pending_admin_review').length) {
  errors.push('summary.factsNeedingReview does not match fact review statuses')
}

const semanticConflicts = detectSemanticConflicts(data.facts || [])
for (const finding of semanticConflicts) {
  warnings.push(`${finding.type} ${finding.scopeKey}: ${finding.values.join(', ')}`)
}

const report = {
  checkedAt: new Date().toISOString(),
  input: inputPath,
  summary: {
    facts: data.facts?.length || 0,
    evidence: data.summary?.evidenceCount || 0,
    rawAnchoredEvidence: rawEvidence.rawAnchoredEvidence,
    unverifiedEvidence: rawEvidence.unverifiedEvidence,
    errors: errors.length,
    warnings: warnings.length,
    semanticConflicts: semanticConflicts.length,
    semanticConflictTypes: semanticConflicts.reduce((counts, finding) => {
      counts[finding.type] = (counts[finding.type] || 0) + 1
      return counts
    }, {}),
  },
  errors,
  warnings,
  semanticConflicts,
  rawEvidence,
  decision: errors.length ? 'REJECT' : warnings.length ? 'REVIEW' : 'PASS',
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({
  checkedAt: report.checkedAt,
  input: report.input,
  summary: report.summary,
  errors: report.errors,
  rawEvidence: report.rawEvidence,
  decision: report.decision,
  conflictScopes: report.semanticConflicts.map(finding => ({
    type: finding.type,
    scopeKey: finding.scopeKey,
    values: finding.values,
  })),
}, null, 2))
if (errors.length) process.exitCode = 1
