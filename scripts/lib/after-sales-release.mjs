import crypto from 'node:crypto'
import { applyApprovalCommand, stableEvidenceId } from './after-sales-approval.mjs'
import { containsSensitiveLocatorData } from './after-sales-service-locations.mjs'

export const AFTER_SALES_RELEASE_SCHEMA_VERSION = 1
export const ACCEPTED_SERVICE_LOCATION_WARNING = 'Per-location warranty/maintenance/repair capabilities are not declared by the locator feed and must not be inferred before admin review'

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .filter(key => value[key] !== undefined)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function sha256Json(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value)).digest('hex')}`
}

function deterministicUuid(value) {
  const bytes = Buffer.from(crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 32), 'hex')
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function isOfficialVinFastUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && (url.hostname === 'vinfastauto.com' || url.hostname.endsWith('.vinfastauto.com'))
  } catch {
    return false
  }
}

function uniqueCount(values) {
  return new Set(values).size
}

function failureCount(value) {
  if (Array.isArray(value)) return value.length
  return Number(value || 0)
}

function makeGate(id, passed, details) {
  return { id, status: passed ? 'PASS' : 'FAIL', details }
}

export function evaluateAfterSalesReleaseReadiness(artifacts) {
  const {
    reviewDataset,
    normalizedDataset,
    adminReviewReport,
    pipelineReport,
    normalizedValidationReport,
    assetVerificationReport,
    regressionReport,
    snapshotInventoryReport,
    serviceLocations,
    serviceLocationValidationReport,
    persistenceAuditReport,
  } = artifacts

  const facts = reviewDataset?.facts || []
  const sources = reviewDataset?.sources || []
  const assets = reviewDataset?.assets || []
  const evidence = facts.flatMap(fact => (fact.evidence || []).map(item => ({ factId: fact.factId, ...item })))
  const reviews = adminReviewReport?.reviews || []
  const locations = serviceLocations?.records || []
  const locationWarnings = serviceLocationValidationReport?.warnings || []
  const acceptedLocationWarnings = locationWarnings.filter(item => item === ACCEPTED_SERVICE_LOCATION_WARNING)
  const unexpectedLocationWarnings = locationWarnings.filter(item => item !== ACCEPTED_SERVICE_LOCATION_WARNING)
  const gates = []

  const datasetCountsValid = facts.length > 0
    && sources.length > 0
    && assets.length > 0
    && reviewDataset?.factCount === facts.length
    && reviewDataset?.sourceCount === sources.length
    && reviewDataset?.assetCount === assets.length
    && reviewDataset?.evidenceCount === evidence.length
    && uniqueCount(facts.map(fact => fact.factId)) === facts.length
    && uniqueCount(facts.map(fact => fact.canonicalKey)) === facts.length
    && uniqueCount(evidence.map(item => `${item.factId}|${item.evidenceId}`)) === evidence.length
  gates.push(makeGate('REVIEW_DATASET_INTEGRITY', datasetCountsValid, {
    sources: sources.length,
    assets: assets.length,
    facts: facts.length,
    evidence: evidence.length,
    uniqueFactIds: uniqueCount(facts.map(fact => fact.factId)),
    uniqueCanonicalKeys: uniqueCount(facts.map(fact => fact.canonicalKey)),
    uniqueEvidenceRelationships: uniqueCount(evidence.map(item => `${item.factId}|${item.evidenceId}`)),
  }))

  const normalizedFacts = normalizedDataset?.facts || []
  const reviewByFactId = new Map(facts.map(fact => [fact.factId, fact]))
  const projectionFields = [
    'factId',
    'factGroupId',
    'canonicalKey',
    'sourceId',
    'sourceIds',
    'serviceType',
    'vehicleType',
    'powertrain',
    'model',
    'subject',
    'policyEntity',
    'batteryChemistry',
    'usageCondition',
    'applicability',
    'action',
    'factType',
    'valueNumeric',
    'valueText',
    'unit',
    'qualifier',
    'intervalRelation',
    'intervalGroupId',
    'intervalGroupDistancePolicy',
    'distancePolicy',
    'confidence',
    'reviewReasons',
    'publicationStatus',
    'supersedesFactIds',
    'sourceFactGroupIds',
    'alternativeTriggers',
    'semanticFlags',
    'groupSemanticFlags',
  ]
  const projectionMismatches = []
  for (const normalizedFact of normalizedFacts) {
    const reviewFact = reviewByFactId.get(normalizedFact.factId)
    if (!reviewFact) {
      projectionMismatches.push({ factId: normalizedFact.factId, reason: 'missing_review_fact' })
      continue
    }
    const expectedProjection = Object.fromEntries(projectionFields.map(field => [field, normalizedFact[field] ?? (
      field === 'batteryChemistry' ? 'not_applicable'
        : field === 'powertrain' ? 'all'
          : field === 'distancePolicy' ? 'not_stated'
            : ['sourceIds', 'reviewReasons', 'supersedesFactIds', 'sourceFactGroupIds', 'alternativeTriggers', 'semanticFlags', 'groupSemanticFlags'].includes(field) ? [] : null
    )]))
    const actualProjection = Object.fromEntries(projectionFields.map(field => [field, reviewFact[field] ?? (
      field === 'batteryChemistry' ? 'not_applicable'
        : field === 'powertrain' ? 'all'
          : field === 'distancePolicy' ? 'not_stated'
            : ['sourceIds', 'reviewReasons', 'supersedesFactIds', 'sourceFactGroupIds', 'alternativeTriggers', 'semanticFlags', 'groupSemanticFlags'].includes(field) ? [] : null
    )]))
    if (sha256Json(expectedProjection) !== sha256Json(actualProjection)) {
      projectionMismatches.push({ factId: normalizedFact.factId, reason: 'semantic_projection_mismatch' })
    }
    if (reviewFact.sourceReviewStatus !== normalizedFact.reviewStatus) {
      projectionMismatches.push({ factId: normalizedFact.factId, reason: 'review_status_projection_mismatch' })
    }

    const reviewEvidenceById = new Map((reviewFact.evidence || []).map(item => [item.evidenceId, item]))
    const normalizedEvidenceIds = new Set()
    for (const provenance of normalizedFact.provenances || []) {
      const evidenceId = stableEvidenceId(provenance)
      normalizedEvidenceIds.add(evidenceId)
      const item = reviewEvidenceById.get(evidenceId)
      if (!item) {
        projectionMismatches.push({ factId: normalizedFact.factId, evidenceId, reason: 'missing_review_evidence' })
        continue
      }
      const expectedEvidence = {
        evidenceId,
        origin: provenance.origin,
        sourceId: provenance.sourceId,
        sourceUrl: provenance.sourceUrl,
        snapshotHash: provenance.snapshotHash || null,
        capturedAt: provenance.capturedAt || null,
        assetUrl: provenance.assetUrl || null,
        assetHash: provenance.assetHash || null,
        pdfPage: provenance.pdfPage ?? null,
        extractionMethod: provenance.extractionMethod || null,
        extractionConfidence: provenance.extractionConfidence ?? null,
        sourceValueText: provenance.sourceValueText || normalizedFact.valueText,
        excerpt: provenance.excerpt,
        contextIndex: provenance.contextIndex || null,
      }
      const actualEvidence = Object.fromEntries(Object.keys(expectedEvidence).map(field => [field, item[field] ?? null]))
      if (sha256Json(expectedEvidence) !== sha256Json(actualEvidence)) {
        projectionMismatches.push({ factId: normalizedFact.factId, evidenceId, reason: 'evidence_projection_mismatch' })
      }
    }
    for (const evidenceId of reviewEvidenceById.keys()) {
      if (!normalizedEvidenceIds.has(evidenceId)) {
        projectionMismatches.push({ factId: normalizedFact.factId, evidenceId, reason: 'unexpected_review_evidence' })
      }
    }
  }
  const normalizedProjectionValid = normalizedDataset?.schemaVersion === 6
    && normalizedDataset?.publicationStatus === 'pending_admin_approval'
    && normalizedFacts.length === facts.length
    && projectionMismatches.length === 0
  gates.push(makeGate('NORMALIZED_REVIEW_PROJECTION_PARITY', normalizedProjectionValid, {
    normalizedSchemaVersion: normalizedDataset?.schemaVersion || null,
    normalizedFacts: normalizedFacts.length,
    reviewFacts: facts.length,
    mismatches: projectionMismatches.length,
    mismatchSample: projectionMismatches.slice(0, 20),
  }))

  const preApprovalStateValid = facts.every(fact => fact.approval?.status === 'pending'
    && fact.sourceReviewStatus === 'pending'
    && fact.publicationStatus === 'review_required')
    && reviewDataset?.pendingCount === facts.length
    && reviewDataset?.approvedCount === 0
    && reviewDataset?.rejectedCount === 0
  gates.push(makeGate('CLEAN_PRE_APPROVAL_STATE', preApprovalStateValid, {
    pending: facts.filter(fact => fact.approval?.status === 'pending').length,
    approved: facts.filter(fact => fact.approval?.status === 'approved').length,
    rejected: facts.filter(fact => fact.approval?.status === 'rejected').length,
  }))

  const pipelineValid = pipelineReport?.gates?.SOURCE_FRESH === 'PASS'
    && pipelineReport?.gates?.DATA_VALID === 'PASS'
    && pipelineReport?.gates?.PROVIDER_HEALTH === 'PASS'
    && pipelineReport?.coverage?.sources === sources.length
    && pipelineReport?.coverage?.passing === sources.length
    && pipelineReport?.coverage?.needsReview === 0
    && pipelineReport?.coverage?.failing === 0
  gates.push(makeGate('PIPELINE_AND_SOURCE_COVERAGE', pipelineValid, {
    gates: pipelineReport?.gates || null,
    coverage: pipelineReport?.coverage || null,
  }))

  const normalizedSummary = normalizedValidationReport?.summary || {}
  const normalizedValid = normalizedValidationReport?.decision === 'PASS'
    && normalizedSummary.facts === facts.length
    && normalizedSummary.evidence === evidence.length
    && normalizedSummary.rawAnchoredEvidence > 0
    && normalizedSummary.unverifiedEvidence === 0
    && normalizedSummary.errors === 0
    && normalizedSummary.warnings === 0
    && normalizedSummary.semanticConflicts === 0
  gates.push(makeGate('NORMALIZED_RAW_EVIDENCE', normalizedValid, normalizedSummary))

  const assetSummary = assetVerificationReport?.summary || {}
  const assetsValid = assetSummary.assets === assets.length
    && assetSummary.verified === assets.length
    && assetSummary.failed === 0
    && assetSummary.mimeMismatch === 0
  gates.push(makeGate('VERIFIED_ASSETS', assetsValid, assetSummary))

  const inventorySummary = snapshotInventoryReport?.summary || {}
  const inventoryValid = snapshotInventoryReport?.decision === 'PASS'
    && inventorySummary.activeSources === sources.length
    && inventorySummary.activeReady === sources.length
    && inventorySummary.newerEligibleNotSelected === 0
    && inventorySummary.unknown === 0
    && inventorySummary.errors === 0
    && inventorySummary.warnings === 0
  gates.push(makeGate('SNAPSHOT_INVENTORY', inventoryValid, inventorySummary))

  const regressionsValid = regressionReport?.decision === 'PASS'
    && Number(regressionReport?.assertions || 0) > 0
    && regressionReport?.facts === facts.length
    && failureCount(regressionReport?.failures) === 0
  gates.push(makeGate('HARD_GATE_REGRESSIONS', regressionsValid, {
    assertions: regressionReport?.assertions || 0,
    facts: regressionReport?.facts ?? null,
    failures: failureCount(regressionReport?.failures),
    decision: regressionReport?.decision || null,
  }))

  const reviewedFactIds = new Set(reviews.map(review => review.factId))
  const factIds = new Set(facts.map(fact => fact.factId))
  const adminReviewValid = adminReviewReport?.reviewScope?.complete === true
    && adminReviewReport?.reviewScope?.factsExpected === facts.length
    && adminReviewReport?.reviewScope?.factsReviewed === facts.length
    && reviews.length === facts.length
    && reviewedFactIds.size === facts.length
    && [...factIds].every(factId => reviewedFactIds.has(factId))
    && reviews.every(review => review.disposition === 'AUTO_CLEAR_CANDIDATE')
    && adminReviewReport?.summary?.autoClearCandidates === facts.length
    && adminReviewReport?.summary?.humanReview === 0
    && adminReviewReport?.summary?.blockedForCorrection === 0
    && adminReviewReport?.summary?.semanticConflicts === 0
    && (adminReviewReport?.semanticConflicts || []).length === 0
  gates.push(makeGate('DELEGATED_ADMIN_FACT_REVIEW', adminReviewValid, {
    expected: facts.length,
    reviewed: reviews.length,
    autoClearCandidates: adminReviewReport?.summary?.autoClearCandidates ?? null,
    humanReview: adminReviewReport?.summary?.humanReview ?? null,
    blockedForCorrection: adminReviewReport?.summary?.blockedForCorrection ?? null,
    semanticConflicts: adminReviewReport?.summary?.semanticConflicts ?? null,
  }))

  const evidenceValid = evidence.every(item => item.evidenceId
    && isOfficialVinFastUrl(item.sourceUrl)
    && item.sourceValueText
    && item.excerpt)
  gates.push(makeGate('EVIDENCE_PROVENANCE_COMPLETENESS', evidenceValid, {
    evidence: evidence.length,
    official: evidence.filter(item => isOfficialVinFastUrl(item.sourceUrl)).length,
    withSourceValue: evidence.filter(item => item.sourceValueText).length,
    withExcerpt: evidence.filter(item => item.excerpt).length,
  }))

  const allowedCategories = new Set(['official_car_workshop', 'partner_car_workshop', 'electric_motorbike_workshop'])
  const locationsValid = locations.length > 0
    && serviceLocationValidationReport?.summary?.records === locations.length
    && serviceLocationValidationReport?.summary?.errors === 0
    && serviceLocationValidationReport?.summary?.unknown === 0
    && ['PASS', 'READY_FOR_ADMIN_REVIEW'].includes(serviceLocationValidationReport?.decision)
    && acceptedLocationWarnings.length === locationWarnings.length
    && unexpectedLocationWarnings.length === 0
    && serviceLocations?.publicationStatus === 'not_approved'
    && serviceLocations?.adminReviewStatus === 'not_started'
    && serviceLocations?.sourceSnapshotId === serviceLocationValidationReport?.sourceSnapshotId
    && uniqueCount(locations.map(location => location.id)) === locations.length
    && !containsSensitiveLocatorData(serviceLocations)
    && locations.every(location => location.sourceSystem === 'VINFAST_OFFICIAL'
      && location.locationType === 'service_workshop'
      && allowedCategories.has(location.locationCategory)
      && location.status !== 'unknown'
      && location.statusBasis === 'official_locator_record'
      && location.reviewStatus === 'not_started'
      && location.capabilityGranularity === 'location_category_only'
      && Array.isArray(location.serviceTypes)
      && location.serviceTypes.length === 1
      && location.serviceTypes[0] === 'general_after_sales'
      && isOfficialVinFastUrl(location.evidence?.sourceUrl)
      && location.evidence?.rawRecordHash)
  gates.push(makeGate('SERVICE_LOCATIONS_ADMIN_SCOPE', locationsValid, {
    records: locations.length,
    active: serviceLocationValidationReport?.summary?.active ?? null,
    inactive: serviceLocationValidationReport?.summary?.inactive ?? null,
    unknown: serviceLocationValidationReport?.summary?.unknown ?? null,
    acceptedWarnings: acceptedLocationWarnings,
    unexpectedWarnings: unexpectedLocationWarnings,
    capabilityPolicy: 'location_category_only_no_inference',
  }))

  const persistenceValid = persistenceAuditReport?.decision === 'PASS'
    && (persistenceAuditReport?.checks || []).length > 0
    && (persistenceAuditReport?.checks || []).every(check => check.passed === true)
    && (persistenceAuditReport?.contradictionProbe?.currentDatasetFindings || []).length === 0
  gates.push(makeGate('PERSISTENCE_HARDENING', persistenceValid, {
    decision: persistenceAuditReport?.decision || null,
    checks: (persistenceAuditReport?.checks || []).length,
    passed: (persistenceAuditReport?.checks || []).filter(check => check.passed).length,
    currentDatasetFindings: (persistenceAuditReport?.contradictionProbe?.currentDatasetFindings || []).length,
  }))

  const failedGates = gates.filter(gate => gate.status !== 'PASS')
  return {
    schemaVersion: AFTER_SALES_RELEASE_SCHEMA_VERSION,
    definition: {
      gateCoverageTargetPercent: 100,
      meaning: 'Every explicit source, evidence, semantic, asset, snapshot, location and persistence gate passed for this exact dataset.',
      absoluteTruthClaim: false,
    },
    summary: {
      hardGates: gates.length,
      passed: gates.length - failedGates.length,
      failed: failedGates.length,
      gateCoveragePercent: gates.length ? Math.round(((gates.length - failedGates.length) / gates.length) * 10000) / 100 : 0,
      sources: sources.length,
      assets: assets.length,
      facts: facts.length,
      evidence: evidence.length,
      serviceLocations: locations.length,
      acceptedWarnings: acceptedLocationWarnings.length,
    },
    acceptedWarnings: acceptedLocationWarnings,
    gates,
    decision: failedGates.length ? 'REJECT' : 'READY_FOR_EXPLICIT_APPROVAL',
  }
}

export function buildApprovedAfterSalesRelease({
  artifacts,
  reviewerId,
  approvedAt = new Date().toISOString(),
  note = 'Đã đối chiếu toàn bộ hard gate và evidence chính thức; cho phép tạo release Supabase.',
}) {
  if (!reviewerId || !String(reviewerId).trim()) throw new Error('reviewerId is required')
  if (Number.isNaN(Date.parse(approvedAt))) throw new Error('approvedAt must be a valid ISO timestamp')
  const readiness = evaluateAfterSalesReleaseReadiness(artifacts)
  if (readiness.decision !== 'READY_FOR_EXPLICIT_APPROVAL') {
    const failed = readiness.gates.filter(gate => gate.status === 'FAIL').map(gate => gate.id)
    throw new Error(`Release approval blocked by: ${failed.join(', ')}`)
  }

  const approvalInputs = {
    reviewDatasetPreApproval: artifacts.reviewDataset,
    normalizedDataset: artifacts.normalizedDataset,
    adminReviewReport: artifacts.adminReviewReport,
    pipelineReport: artifacts.pipelineReport,
    normalizedValidationReport: artifacts.normalizedValidationReport,
    assetVerificationReport: artifacts.assetVerificationReport,
    regressionReport: artifacts.regressionReport,
    snapshotInventoryReport: artifacts.snapshotInventoryReport,
    serviceLocationsPreApproval: artifacts.serviceLocations,
    serviceLocationValidationReport: artifacts.serviceLocationValidationReport,
    persistenceAuditReport: artifacts.persistenceAuditReport,
  }
  const inputHashes = Object.fromEntries(Object.entries(approvalInputs).map(([key, value]) => [key, sha256Json(value)]))

  const reviewer = String(reviewerId).trim()
  const normalizedNote = String(note || '').trim() || null
  const releaseSeed = sha256Json({ inputHashes, reviewer, approvedAt })
  const releaseId = `after_sales_${releaseSeed.slice('sha256:'.length, 'sha256:'.length + 24)}`
  const approvalEvents = []
  const approvedFacts = artifacts.reviewDataset.facts.map(fact => {
    const result = applyApprovalCommand(fact.approval, {
      status: 'approved',
      reviewerId: reviewer,
      reviewedAt: approvedAt,
      note: normalizedNote,
    })
    approvalEvents.push({
      approvalId: deterministicUuid(`${releaseId}|${fact.factId}|pending|approved`),
      factId: fact.factId,
      ...result.history,
    })
    return {
      ...structuredClone(fact),
      sourceReviewStatus: 'approved',
      publicationStatus: 'approved_for_publication',
      approval: result.current,
    }
  })

  const approvedReviewDataset = {
    ...structuredClone(artifacts.reviewDataset),
    purpose: 'approved_after_sales_publication_release',
    publicationStatus: 'approved_for_supabase',
    adminReviewStatus: 'approved',
    release: { releaseId, approvedAt, reviewerId: reviewer, reviewerType: 'delegated_admin_agent' },
    pendingCount: 0,
    approvedCount: approvedFacts.length,
    rejectedCount: 0,
    updatedAt: approvedAt,
    approvalEvents,
    sources: artifacts.reviewDataset.sources.map(source => ({ ...structuredClone(source), reviewStatus: 'approved' })),
    assets: artifacts.reviewDataset.assets.map(asset => ({ ...structuredClone(asset), reviewStatus: 'approved' })),
    facts: approvedFacts,
  }

  const approvedServiceLocations = {
    ...structuredClone(artifacts.serviceLocations),
    publicationStatus: 'approved_for_supabase',
    adminReviewStatus: 'approved',
    release: { releaseId, approvedAt, reviewerId: reviewer, reviewerType: 'delegated_admin_agent' },
    records: artifacts.serviceLocations.records.map(location => ({
      ...structuredClone(location),
      reviewStatus: 'approved',
      approvedBy: reviewer,
      approvedAt,
    })),
  }

  const reviewDatasetHash = sha256Json(approvedReviewDataset)
  const serviceLocationsHash = sha256Json(approvedServiceLocations)
  const manifest = {
    schemaVersion: AFTER_SALES_RELEASE_SCHEMA_VERSION,
    releaseId,
    decision: 'APPROVED_FOR_SUPABASE',
    approvedAt,
    reviewer: {
      id: reviewer,
      type: 'delegated_admin_agent',
      authority: 'explicit_user_authorization',
      note: normalizedNote,
    },
    verificationDefinition: readiness.definition,
    scope: {
      ...readiness.summary,
      approvalEvents: approvalEvents.length,
    },
    acceptedWarnings: readiness.acceptedWarnings,
    gates: readiness.gates,
    inputHashes,
    inputs: Object.fromEntries(Object.entries(inputHashes).map(([key, sha256]) => [key, {
      file: `inputs/${key}.json`,
      sha256,
    }])),
    datasets: {
      reviewDataset: {
        file: 'review-dataset.json',
        sha256: reviewDatasetHash,
        facts: approvedReviewDataset.factCount,
        evidence: approvedReviewDataset.evidenceCount,
      },
      serviceLocations: {
        file: 'service-locations.json',
        sha256: serviceLocationsHash,
        records: approvedServiceLocations.records.length,
      },
    },
    publication: {
      target: 'supabase',
      status: 'NOT_PUBLISHED',
      requiresApplyFlag: true,
      requiredReleaseId: releaseId,
      atomicRpc: 'publish_after_sales_release',
    },
  }

  return {
    readiness,
    manifest,
    reviewDataset: approvedReviewDataset,
    serviceLocations: approvedServiceLocations,
    approvalInputs,
  }
}

export function verifyApprovedAfterSalesRelease({ manifest, reviewDataset, serviceLocations }) {
  const errors = []
  const facts = reviewDataset?.facts || []
  const events = reviewDataset?.approvalEvents || []
  const locations = serviceLocations?.records || []
  const eventByFact = new Map(events.map(event => [event.factId, event]))

  if (manifest?.decision !== 'APPROVED_FOR_SUPABASE') errors.push('manifest decision is not APPROVED_FOR_SUPABASE')
  if (!manifest?.releaseId) errors.push('manifest releaseId is missing')
  if (reviewDataset?.release?.releaseId !== manifest?.releaseId) errors.push('review dataset releaseId mismatch')
  if (serviceLocations?.release?.releaseId !== manifest?.releaseId) errors.push('service-location releaseId mismatch')
  if (manifest?.datasets?.reviewDataset?.sha256 !== sha256Json(reviewDataset)) errors.push('review dataset hash mismatch')
  if (manifest?.datasets?.serviceLocations?.sha256 !== sha256Json(serviceLocations)) errors.push('service-location dataset hash mismatch')
  if (manifest?.scope?.facts !== facts.length || reviewDataset?.factCount !== facts.length) errors.push('fact count mismatch')
  if (manifest?.scope?.evidence !== reviewDataset?.evidenceCount) errors.push('evidence count mismatch')
  if (manifest?.scope?.serviceLocations !== locations.length) errors.push('service-location count mismatch')
  if (reviewDataset?.publicationStatus !== 'approved_for_supabase' || reviewDataset?.adminReviewStatus !== 'approved') {
    errors.push('review dataset is not approved for Supabase')
  }
  if (serviceLocations?.publicationStatus !== 'approved_for_supabase' || serviceLocations?.adminReviewStatus !== 'approved') {
    errors.push('service locations are not approved for Supabase')
  }
  if (reviewDataset?.pendingCount !== 0 || reviewDataset?.approvedCount !== facts.length || reviewDataset?.rejectedCount !== 0) {
    errors.push('review dataset approval counters are invalid')
  }
  if (events.length !== facts.length || uniqueCount(events.map(event => event.approvalId)) !== events.length) {
    errors.push('approval event count or identity is invalid')
  }
  for (const fact of facts) {
    if (fact.approval?.status !== 'approved'
      || !fact.approval?.reviewerId
      || !fact.approval?.reviewedAt
      || !fact.approval?.approvedBy
      || !fact.approval?.approvedAt
      || fact.sourceReviewStatus !== 'approved'
      || fact.publicationStatus !== 'approved_for_publication') {
      errors.push(`fact ${fact.factId} is not fully approved`)
      continue
    }
    const event = eventByFact.get(fact.factId)
    if (!event || event.fromStatus !== 'pending' || event.toStatus !== 'approved'
      || event.reviewerId !== fact.approval.reviewerId
      || event.reviewedAt !== fact.approval.reviewedAt) {
      errors.push(`fact ${fact.factId} has no matching approval event`)
    }
  }
  if (locations.some(location => location.reviewStatus !== 'approved'
    || !location.approvedBy
    || !location.approvedAt
    || location.capabilityGranularity !== 'location_category_only')) {
    errors.push('one or more service locations are not safely approved')
  }

  return {
    schemaVersion: AFTER_SALES_RELEASE_SCHEMA_VERSION,
    releaseId: manifest?.releaseId || null,
    summary: {
      facts: facts.length,
      evidence: reviewDataset?.evidenceCount || 0,
      approvalEvents: events.length,
      serviceLocations: locations.length,
      errors: errors.length,
    },
    errors,
    decision: errors.length ? 'REJECT' : 'PASS',
  }
}
