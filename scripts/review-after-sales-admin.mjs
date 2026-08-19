import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectSemanticConflicts } from './lib/after-sales-persistence-audit.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const inputPath = path.resolve(process.argv.find(argument => argument.startsWith('--input='))?.slice('--input='.length)
  || path.join(ROOT, 'public/data/after-sales-normalized.json'))
const outputPath = path.resolve(process.argv.find(argument => argument.startsWith('--output='))?.slice('--output='.length)
  || path.join(ROOT, '.local/after-sales/admin-review-report.json'))
const queuePath = path.resolve(process.argv.find(argument => argument.startsWith('--queue='))?.slice('--queue='.length)
  || path.join(ROOT, '.local/after-sales/admin-review-queue.json'))

const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
const facts = data.facts || []

const fold = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\u0111/g, 'd')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim()

const compact = value => fold(value).replace(/[^a-z0-9]+/g, '')
const anyExcerpt = (fact, predicate) => (fact.provenances || []).some(provenance => predicate(provenance.excerpt || ''))
const directValueInEvidence = fact => anyExcerpt(fact, excerpt => compact(excerpt).includes(compact(fact.valueText)))
const officialEvidence = fact => (fact.provenances || []).every(provenance => {
  try {
    const url = new URL(provenance.sourceUrl)
    return url.protocol === 'https:' && (url.hostname === 'vinfastauto.com' || url.hostname.endsWith('.vinfastauto.com'))
  } catch {
    return false
  }
})

// Explicit only: the normalizer must not infer "whichever comes first" from
// just "hoặc". This recognizes the Vietnamese forms used by official pages
// and PDFs, including "tùy điều kiện đến trước" and "tùy thuộc vào...".
const whicheverComesFirst = /tuy(?:\s+(?:theo|thuoc)(?:\s+vao)?)?\s+dieu\s+kien(?:\s+nao)?\s+den\s+truoc/u
const evidenceSaysWhichever = fact => anyExcerpt(fact, excerpt => whicheverComesFirst.test(fold(excerpt)))

function intervalPairKey(fact) {
  return [
    fact.intervalGroupId,
    fact.vehicleType,
    fact.powertrain,
    fact.model || 'all_models',
    fact.subject,
    fact.action,
    fact.usageCondition,
    fact.applicability,
  ].join('|')
}

const intervalScopes = new Map()
for (const fact of facts.filter(item => item.intervalGroupId)) {
  const key = intervalPairKey(fact)
  if (!intervalScopes.has(key)) intervalScopes.set(key, [])
  intervalScopes.get(key).push(fact)
}

function relaxedIntervalGroupMembers(fact) {
  return facts.filter(candidate => candidate.intervalGroupId === fact.intervalGroupId
    && candidate.vehicleType === fact.vehicleType
    && candidate.powertrain === fact.powertrain
    && (candidate.model || null) === (fact.model || null)
    && candidate.subject === fact.subject
    && candidate.action === fact.action)
}

function addFinding(findings, code, severity, message, evidence = null) {
  findings.push({ code, severity, message, evidence })
}

function makeReview(fact) {
  const findings = []
  const valueCovered = directValueInEvidence(fact)
  const sourceOfficial = officialEvidence(fact)
  const hasExplicitQualifier = evidenceSaysWhichever(fact)
  const groupMembers = fact.intervalGroupId ? intervalScopes.get(intervalPairKey(fact)) || [] : []
  const relaxedMembers = fact.intervalGroupId ? relaxedIntervalGroupMembers(fact) : []
  const relaxedScopeVariants = new Set(relaxedMembers.map(member => [
    member.powertrain,
    member.usageCondition,
    member.applicability,
  ].join('|')))
  const modelAnchored = !fact.model || anyExcerpt(fact, excerpt => compact(excerpt).includes(compact(fact.model)))
    || (fact.provenances || []).some(provenance => Boolean(provenance.assetUrl))

  if (!valueCovered) addFinding(findings, 'VALUE_NOT_IN_EVIDENCE', 'blocker', 'Normalized valueText is not present in any provenance excerpt.')
  if (!sourceOfficial) addFinding(findings, 'NON_OFFICIAL_EVIDENCE', 'blocker', 'At least one provenance source URL is not an official VinFast URL.')
  if (!modelAnchored) addFinding(findings, 'MODEL_SCOPE_UNANCHORED', 'blocker', 'Model is neither present in evidence nor anchored by a source asset.')
  if (hasExplicitQualifier && fact.qualifier !== 'whichever_comes_first') {
    addFinding(findings, 'MISSING_EXPLICIT_QUALIFIER', 'blocker', 'Evidence explicitly states a condition that comes first, but qualifier is not normalized.', fact.provenance.excerpt)
  }
  if (fact.qualifier === 'whichever_comes_first' && !hasExplicitQualifier) {
    addFinding(findings, 'UNSUPPORTED_QUALIFIER', 'blocker', 'Qualifier is normalized without an explicit whichever-comes-first phrase in evidence.', fact.provenance.excerpt)
  }
  if (fact.unit !== 'km' && fact.distancePolicy === 'limited') {
    addFinding(findings, 'TEMPORAL_DISTANCE_POLICY_LEAK', 'warning', 'A time fact carries limited distancePolicy at fact level; this belongs to its paired distance fact or interval group.', fact.provenance.excerpt)
  }
  if (fact.intervalRelation === 'or' && groupMembers.length < 2 && relaxedMembers.length >= 2 && relaxedScopeVariants.size > 1) {
    addFinding(findings, 'INTERVAL_SCOPE_MISMATCH', 'blocker', 'Paired facts from the same source statement carry different powertrain, usageCondition, or applicability scopes.', relaxedMembers.map(member => ({
      factId: member.factId,
      powertrain: member.powertrain,
      usageCondition: member.usageCondition,
      applicability: member.applicability,
    })))
  } else if (fact.intervalRelation === 'or' && groupMembers.length < 2) {
    addFinding(findings, 'INCOMPLETE_ALTERNATIVE_TRIGGER', 'warning', 'OR interval group has no normalized sibling. The omitted alternative may be a non-numeric event trigger.', fact.provenance.excerpt)
  }
  if (fact.reviewStatus === 'pending_admin_review') {
    addFinding(findings, 'EXISTING_ADMIN_REVIEW_QUEUE', 'human_review', 'This fact was intentionally held for administrator review by the source/normalization workflow.', fact.provenance.excerpt)
  }
  if ((fact.semanticFlags || []).length) {
    addFinding(findings, 'FACT_SEMANTIC_FLAG', 'human_review', `Fact semantic flags: ${fact.semanticFlags.join(', ')}.`, fact.provenance.excerpt)
  }
  if ((fact.groupSemanticFlags || []).includes('MULTI_ACTION_CLAUSE')) {
    addFinding(findings, 'MULTI_ACTION_GROUP_VALIDATED', 'info', 'Multi-action source statement is retained as a group flag; local action/value bindings are evaluated separately.', fact.provenance.excerpt)
  }

  const needsHuman = findings.some(finding => ['blocker', 'warning', 'human_review'].includes(finding.severity))
  const hasBlocker = findings.some(finding => finding.severity === 'blocker')
  return {
    factId: fact.factId,
    disposition: hasBlocker ? 'BLOCKED_FOR_CORRECTION' : needsHuman ? 'HUMAN_REVIEW' : 'AUTO_CLEAR_CANDIDATE',
    reviewChecks: {
      directValueEvidence: valueCovered,
      officialEvidence: sourceOfficial,
      modelScopeAnchored: modelAnchored,
      explicitWhicheverEvidence: hasExplicitQualifier,
      intervalScopeMemberCount: groupMembers.length,
      relaxedIntervalScopeVariantCount: relaxedScopeVariants.size,
    },
    findings,
    fact: {
      factGroupId: fact.factGroupId,
      canonicalKey: fact.canonicalKey,
      sourceId: fact.sourceId,
      serviceType: fact.serviceType,
      model: fact.model,
      subject: fact.subject,
      action: fact.action,
      factType: fact.factType,
      valueNumeric: fact.valueNumeric,
      valueText: fact.valueText,
      unit: fact.unit,
      qualifier: fact.qualifier,
      intervalRelation: fact.intervalRelation,
      intervalGroupId: fact.intervalGroupId,
      intervalGroupDistancePolicy: fact.intervalGroupDistancePolicy,
      distancePolicy: fact.distancePolicy,
      confidence: fact.confidence,
      sourceReviewStatus: fact.reviewStatus,
    },
    evidence: {
      origin: fact.provenance?.origin || null,
      sourceUrl: fact.provenance?.sourceUrl || null,
      assetUrl: fact.provenance?.assetUrl || null,
      pdfPage: fact.provenance?.pdfPage ?? null,
      excerpt: fact.provenance?.excerpt || null,
    },
  }
}

const reviews = facts.map(makeReview).sort((a, b) => a.factId.localeCompare(b.factId))
const queues = {
  blockedForCorrection: reviews.filter(review => review.disposition === 'BLOCKED_FOR_CORRECTION'),
  humanReview: reviews.filter(review => review.disposition === 'HUMAN_REVIEW'),
  autoClearCandidates: reviews.filter(review => review.disposition === 'AUTO_CLEAR_CANDIDATE'),
}
const countFindings = reviews
  .flatMap(review => review.findings)
  .reduce((counts, finding) => {
    counts[finding.code] = (counts[finding.code] || 0) + 1
    return counts
  }, {})
const conflicts = detectSemanticConflicts(facts)

const report = {
  reviewer: {
    id: 'after-sales-local-admin-reviewer',
    version: 'v1',
    mode: 'read_only_deterministic',
    authority: 'does_not_mutate_normalized_data_or_approval_state',
  },
  reviewedAt: new Date().toISOString(),
  input: inputPath,
  reviewScope: {
    factsExpected: facts.length,
    factsReviewed: reviews.length,
    complete: facts.length === reviews.length,
    criteria: [
      'direct normalized value evidence',
      'official source provenance',
      'model scope anchor',
      'explicit whichever-comes-first qualifier parity',
      'fact-level versus group-level distance policy ownership',
      'interval alternative completeness',
      'existing admin/semantic hold flags',
      'cross-fact contradiction detection',
    ],
  },
  summary: {
    autoClearCandidates: queues.autoClearCandidates.length,
    humanReview: queues.humanReview.length,
    blockedForCorrection: queues.blockedForCorrection.length,
    directValueEvidence: reviews.filter(review => review.reviewChecks.directValueEvidence).length,
    officialEvidence: reviews.filter(review => review.reviewChecks.officialEvidence).length,
    modelScopeAnchored: reviews.filter(review => review.reviewChecks.modelScopeAnchored).length,
    semanticConflicts: conflicts.length,
    findingCounts: Object.fromEntries(Object.entries(countFindings).sort(([a], [b]) => a.localeCompare(b))),
  },
  semanticConflicts: conflicts,
  reviews,
}

const queue = {
  reviewer: report.reviewer,
  reviewedAt: report.reviewedAt,
  summary: report.summary,
  blockedForCorrection: queues.blockedForCorrection,
  humanReview: queues.humanReview,
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.mkdirSync(path.dirname(queuePath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
fs.writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`)

console.log(JSON.stringify({
  reviewer: report.reviewer.id,
  factsReviewed: report.reviewScope.factsReviewed,
  complete: report.reviewScope.complete,
  ...report.summary,
  output: outputPath,
  queue: queuePath,
  decision: queues.blockedForCorrection.length ? 'CORRECTION_REQUIRED' : queues.humanReview.length ? 'HUMAN_REVIEW_REQUIRED' : 'READY_FOR_APPROVAL',
}, null, 2))

if (queues.blockedForCorrection.length) process.exitCode = 1
