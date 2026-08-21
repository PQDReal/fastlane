import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  ACCEPTED_SERVICE_LOCATION_WARNING,
  buildApprovedAfterSalesRelease,
  evaluateAfterSalesReleaseReadiness,
  sha256Json,
  verifyApprovedAfterSalesRelease,
} from './after-sales-release.mjs'
import { buildImportPlan } from './after-sales-importer.mjs'
import { stableEvidenceId } from './after-sales-approval.mjs'

function fixture() {
  const provenance = {
    origin: 'snapshot_page_text',
    sourceId: 'source-1',
    sourceUrl: 'https://vinfastauto.com/vn_vi/test',
    sourceValueText: '12 tháng',
    excerpt: 'Kiểm tra sau 12 tháng.',
  }
  const evidence = {
    evidenceId: stableEvidenceId(provenance),
    ...provenance,
  }
  const fact = {
    factId: 'fact-1',
    factGroupId: 'group-1',
    canonicalKey: 'canonical-1',
    sourceId: 'source-1',
    sourceIds: ['source-1'],
    serviceType: 'maintenance',
    vehicleType: 'car',
    subject: 'test',
    policyEntity: 'test',
    usageCondition: 'general',
    applicability: 'general',
    action: 'inspect',
    factType: 'maintenance_interval_time',
    valueNumeric: 12,
    valueText: '12 tháng',
    unit: 'month',
    confidence: 1,
    sourceReviewStatus: 'pending',
    publicationStatus: 'review_required',
    approval: { status: 'pending', reviewerId: null, reviewedAt: null, approvedBy: null, approvedAt: null, note: null },
    evidence: [evidence],
  }
  const reviewDataset = {
    schemaVersion: 5,
    purpose: 'human_fact_review_only',
    sourceCount: 1,
    assetCount: 1,
    factCount: 1,
    evidenceCount: 1,
    pendingCount: 1,
    approvedCount: 0,
    rejectedCount: 0,
    sources: [{ sourceId: 'source-1', sourceUrl: 'https://vinfastauto.com/vn_vi/test' }],
    assets: [{ assetId: 'asset-1', sourceId: 'source-1' }],
    facts: [fact],
  }
  const normalizedDataset = {
    schemaVersion: 6,
    publicationStatus: 'pending_admin_approval',
    facts: [{
      ...structuredClone(fact),
      reviewStatus: fact.sourceReviewStatus,
      approval: undefined,
      evidence: undefined,
      evidenceCount: 1,
      provenances: [provenance],
    }],
  }
  normalizedDataset.facts[0].provenance = normalizedDataset.facts[0].provenances[0]
  const serviceLocations = {
    sourceSnapshotId: 'locations-1',
    publicationStatus: 'not_approved',
    adminReviewStatus: 'not_started',
    records: [{
      id: 'location-1',
      sourceSystem: 'VINFAST_OFFICIAL',
      locationType: 'service_workshop',
      locationCategory: 'official_car_workshop',
      serviceTypes: ['general_after_sales'],
      capabilityGranularity: 'location_category_only',
      status: 'active',
      statusBasis: 'official_locator_record',
      reviewStatus: 'not_started',
      evidence: { sourceUrl: 'https://vinfastauto.com/vn_vi/tim-kiem-showroom', rawRecordHash: 'sha256:raw' },
    }],
  }
  return {
    reviewDataset,
    normalizedDataset,
    adminReviewReport: {
      reviewScope: { complete: true, factsExpected: 1, factsReviewed: 1 },
      summary: { autoClearCandidates: 1, humanReview: 0, blockedForCorrection: 0, semanticConflicts: 0 },
      semanticConflicts: [],
      reviews: [{ factId: 'fact-1', disposition: 'AUTO_CLEAR_CANDIDATE' }],
    },
    pipelineReport: {
      gates: { SOURCE_FRESH: 'PASS', DATA_VALID: 'PASS', PROVIDER_HEALTH: 'PASS', HUMAN_APPROVAL: 'NOT_STARTED' },
      coverage: { sources: 1, passing: 1, needsReview: 0, failing: 0 },
    },
    normalizedValidationReport: {
      decision: 'PASS',
      summary: { facts: 1, evidence: 1, rawAnchoredEvidence: 1, unverifiedEvidence: 0, errors: 0, warnings: 0, semanticConflicts: 0 },
    },
    assetVerificationReport: { summary: { assets: 1, verified: 1, failed: 0, mimeMismatch: 0 } },
    regressionReport: { decision: 'PASS', assertions: 1, facts: 1, failures: 0 },
    snapshotInventoryReport: {
      decision: 'PASS',
      summary: { activeSources: 1, activeReady: 1, newerEligibleNotSelected: 0, unknown: 0, errors: 0, warnings: 0 },
    },
    serviceLocations,
    serviceLocationValidationReport: {
      sourceSnapshotId: 'locations-1',
      decision: 'READY_FOR_ADMIN_REVIEW',
      summary: { records: 1, errors: 0, warnings: 1, active: 1, inactive: 0, unknown: 0 },
      warnings: [ACCEPTED_SERVICE_LOCATION_WARNING],
    },
    persistenceAuditReport: {
      decision: 'PASS',
      checks: [{ passed: true }],
      contradictionProbe: { currentDatasetFindings: [] },
    },
  }
}

test('approves an exact fully gated release and binds it with hashes', () => {
  const artifacts = fixture()
  const readiness = evaluateAfterSalesReleaseReadiness(artifacts)
  assert.equal(readiness.decision, 'READY_FOR_EXPLICIT_APPROVAL')
  assert.equal(readiness.summary.gateCoveragePercent, 100)

  const release = buildApprovedAfterSalesRelease({
    artifacts,
    reviewerId: 'delegated-review-agent',
    approvedAt: '2026-08-20T10:00:00.000Z',
  })
  assert.equal(release.reviewDataset.facts[0].approval.status, 'approved')
  assert.equal(release.reviewDataset.approvalEvents.length, 1)
  assert.equal(release.serviceLocations.records[0].reviewStatus, 'approved')
  assert.equal(Object.keys(release.approvalInputs).length, Object.keys(release.manifest.inputs).length)
  assert.ok(Object.entries(release.approvalInputs).every(([key, value]) => release.manifest.inputs[key].sha256 === sha256Json(value)))
  assert.equal(verifyApprovedAfterSalesRelease(release).decision, 'PASS')
  assert.equal(buildImportPlan(release.reviewDataset, {}, { requireApproved: true }).decision, 'READY')
})

test('strict importer rejects the pending pre-review dataset', () => {
  const plan = buildImportPlan(fixture().reviewDataset, {}, { requireApproved: true })
  assert.equal(plan.decision, 'REJECT')
  assert.ok(plan.rejectedWrites.some(item => item.reason === 'facts_not_approved'))
  assert.ok(plan.rejectedWrites.some(item => item.reason === 'dataset_not_approved_for_supabase'))
})

test('blocks approval when any admin review item is unresolved', () => {
  const artifacts = fixture()
  artifacts.adminReviewReport.reviews[0].disposition = 'HUMAN_REVIEW'
  const readiness = evaluateAfterSalesReleaseReadiness(artifacts)
  assert.equal(readiness.decision, 'REJECT')
  assert.equal(readiness.gates.find(gate => gate.id === 'DELEGATED_ADMIN_FACT_REVIEW').status, 'FAIL')
})

test('detects a tampered approved dataset', () => {
  const release = buildApprovedAfterSalesRelease({
    artifacts: fixture(),
    reviewerId: 'delegated-review-agent',
    approvedAt: '2026-08-20T10:00:00.000Z',
  })
  release.reviewDataset.facts[0].valueNumeric = 13
  const verification = verifyApprovedAfterSalesRelease(release)
  assert.equal(verification.decision, 'REJECT')
  assert.ok(verification.errors.includes('review dataset hash mismatch'))
  assert.notEqual(release.manifest.datasets.reviewDataset.sha256, sha256Json(release.reviewDataset))
})

test('Supabase migration exposes only the atomic publisher mutation path', () => {
  const migration = fs.readFileSync(path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../migrations/061_after_sales_release_publication.sql',
  ), 'utf8')
  assert.match(migration, /security definer[\s\S]+auth\.role\(\)[\s\S]+service_role/iu)
  assert.match(migration, /revoke all on function public\.publish_after_sales_release\(jsonb\) from public, anon, authenticated, service_role/iu)
  assert.match(migration, /grant execute on function public\.publish_after_sales_release\(jsonb\) to service_role/iu)
  assert.match(migration, /revoke insert, update, delete, truncate on table public\.after_sales_facts from service_role/iu)
  assert.doesNotMatch(migration, /grant execute on function public\.publish_after_sales_release\(jsonb\) to (?:anon|authenticated)/iu)
})
