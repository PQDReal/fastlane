import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reuseVerifiedAssets = process.argv.includes('--reuse-verified-assets')
const rawRecapture = process.argv.includes('--raw-recapture')
const stopBeforeAdminReview = process.argv.includes('--stop-before-admin-review')

function run(file, args = [], { allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file, ...args], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    })
    child.on('exit', code => {
      if (code && !allowFailure) reject(new Error(`${path.basename(file)} exited ${code}`))
      else resolve(code || 0)
    })
  })
}

function readJson(relativePath) {
  const file = path.join(ROOT, relativePath)
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
}

function persistNormalizedCheckpoint() {
  const source = path.join(ROOT, 'public', 'data', 'after-sales-normalized.json')
  if (!fs.existsSync(source)) return null
  const target = path.join(ROOT, '.local', 'after-sales', 'normalized-checkpoint.json')
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(source, target)
  return target
}

const stageResults = []
const degradedReasons = []
let fatalError = null

async function runStage(name, file, args = [], options = {}) {
  try {
    const exitCode = await run(file, args, options)
    stageResults.push({ name, status: exitCode ? 'failed' : 'passed', exitCode })
    return exitCode
  } catch (error) {
    stageResults.push({ name, status: 'failed', error: error.message })
    throw error
  }
}

try {
  try {
    await runStage('ensure_snapshots', 'scripts/ensure-after-sales-snapshots.mjs', rawRecapture ? ['--raw-recapture'] : [])
  } catch (error) {
    degradedReasons.push(error.message)
    const coverage = readJson('.local/after-sales/coverage-report.json')
    const acquisition = readJson('.local/after-sales/acquisition-report.json')
    if (coverage?.recrawlSourceIds?.length) degradedReasons.push(`recrawl required: ${coverage.recrawlSourceIds.join(', ')}`)
    for (const attempt of acquisition?.runSources || []) {
      if (!attempt.latestRetained) continue
      const failures = (attempt.acquisitionFailures || []).map(item => `${item.provider}: ${item.message}`).join('; ')
      degradedReasons.push(`${attempt.sourceId}: retained ${attempt.retainedSnapshotId}; ${failures}`)
    }
  }
  await runStage('audit_snapshot_inventory', 'scripts/audit-after-sales-snapshot-inventory.mjs', ['--summary'])
  if (stopBeforeAdminReview) {
    await runStage('acquire_reader_fallback', 'scripts/acquire-after-sales-reader-fallback.mjs')
    await runStage('extract_reader_fallback', 'scripts/extract-after-sales-reader-fallback.mjs')
    await runStage('validate_reader_fallback', 'scripts/validate-after-sales-reader-fallback.mjs')
  }
  await runStage('acquire_service_locations', 'scripts/acquire-after-sales-service-locations.mjs')
  await runStage('extract_service_locations', 'scripts/extract-after-sales-service-locations.mjs')
  await runStage('validate_service_locations', 'scripts/validate-after-sales-service-locations.mjs')
  await runStage('parse_assets', 'scripts/parse-after-sales-assets.mjs')
  const verifyArgs = reuseVerifiedAssets ? ['--retry-failed'] : []
  const verifyExit = await runStage('verify_assets', 'scripts/verify-after-sales-assets.mjs', verifyArgs, { allowFailure: true })
  if (verifyExit) await runStage('retry_failed_assets', 'scripts/verify-after-sales-assets.mjs', ['--retry-failed'])
  await runStage('extract_content', 'scripts/extract-after-sales-content.mjs', ['--reuse-extracted'])
  await runStage('normalize_facts', 'scripts/normalize-after-sales-facts.mjs')
  persistNormalizedCheckpoint()
  await runStage('validate_facts', 'scripts/validate-after-sales-facts.mjs')
  await runStage('validate_regressions', 'scripts/validate-after-sales-regressions.mjs')
  await runStage('rebuild_normalized_v6', 'scripts/rebuild-after-sales-normalized.mjs', [
    'public/data/after-sales-normalized.json',
    '.local/after-sales/after-sales-normalized-v6.json',
    'scripts/data/after-sales-source-manifest.json',
  ])
  await runStage('validate_normalized_v6', 'scripts/validate-after-sales-normalized-v6.mjs')
  if (!stopBeforeAdminReview) {
    await runStage('build_review_dataset_v6', 'scripts/build-after-sales-review-dataset.mjs', [
      '--normalized=.local/after-sales/after-sales-normalized-v6.json',
    ])
  }
} catch (error) {
  fatalError = error
}

const coverageReport = readJson('.local/after-sales/coverage-report.json')
const dataValidationReport = readJson('.local/after-sales/validation-report.json')
const assetVerificationReport = readJson('.local/after-sales/asset-verification-report.json')
const factValidationReport = readJson('.local/after-sales/fact-validation-report.json')
const providerHealthReport = readJson('.local/after-sales/provider-health.json')
const regressionReport = readJson('.local/after-sales/regression-report.json')
const normalizedV6Report = readJson('.local/after-sales/normalized-v6-validation-report.json')
const snapshotInventoryReport = readJson('.local/after-sales/snapshot-inventory-report.json')
const serviceLocationValidationReport = readJson('.local/after-sales/service-locations/validation-report.json')
const serviceLocationDataset = readJson('.local/after-sales/service-locations/extracted/latest.json')
const transformedValidationReport = readJson('.local/after-sales/transformed-validation-report.json')
const transformedDataset = readJson('.local/after-sales/transformed-extracted.json')
const reviewDataset = readJson('.local/after-sales/review-dataset.json')
const sourceFresh = coverageReport?.summary?.failing === 0
const dataHasErrors = dataValidationReport?.summary?.errors > 0
  || assetVerificationReport?.summary?.failed > 0
  || factValidationReport?.summary?.errors > 0
  || regressionReport?.failures?.length > 0
  || normalizedV6Report?.summary?.errors > 0
  || snapshotInventoryReport?.summary?.errors > 0
  || serviceLocationValidationReport?.summary?.errors > 0
const dataValid = !dataHasErrors
const dataNeedsReview = (factValidationReport?.summary?.warnings || 0) > 0
  || (normalizedV6Report?.summary?.warnings || 0) > 0
  || (snapshotInventoryReport?.summary?.warnings || 0) > 0
const providerDegraded = Object.values(providerHealthReport?.providers || {}).some(provider => !['available', 'not_configured'].includes(provider.status))
const pipelineStatus = fatalError
  ? 'FAILED'
  : degradedReasons.length
    ? 'DEGRADED'
    : !dataValid
      ? 'FAILED'
      : dataNeedsReview
        ? 'REVIEW'
        : 'PASS'

const report = {
  pipelineVersion: 'after-sales-pipeline-v2',
  completedAt: new Date().toISOString(),
  status: pipelineStatus,
  degradedReasons,
  fatalError: fatalError?.message || null,
  gates: {
    SOURCE_FRESH: sourceFresh ? 'PASS' : 'FAIL',
    DATA_VALID: !dataValid ? 'FAIL' : dataNeedsReview ? 'REVIEW' : 'PASS',
    PROVIDER_HEALTH: providerDegraded ? 'DEGRADED' : 'PASS',
    HUMAN_APPROVAL: stopBeforeAdminReview ? 'NOT_STARTED' : 'PENDING',
  },
  dataFreshness: sourceFresh ? 'fresh' : 'stale',
  dataIntegrity: !dataValid ? 'invalid' : dataNeedsReview ? 'review_required' : 'valid',
  stages: stageResults,
  acquisitionAttempts: readJson('.local/after-sales/acquisition-report.json')?.runSources || [],
  providerHealth: providerHealthReport?.providers || {},
  coverage: coverageReport?.summary || null,
  snapshotInventory: snapshotInventoryReport?.summary || null,
  dataValidation: dataValidationReport?.summary || null,
  assetVerification: assetVerificationReport?.summary || null,
  extraction: readJson('public/data/after-sales-extracted.json')?.summary || null,
  normalization: readJson('public/data/after-sales-normalized.json')?.summary || null,
  normalizationV6: readJson('.local/after-sales/after-sales-normalized-v6.json')?.summary || null,
  normalizationV6Validation: normalizedV6Report?.summary || null,
  serviceLocations: serviceLocationDataset?.summary || null,
  serviceLocationValidation: serviceLocationValidationReport?.summary || null,
  transformedFallback: transformedDataset?.summary || null,
  transformedFallbackValidation: transformedValidationReport?.summary || null,
  reviewDataset: !stopBeforeAdminReview && reviewDataset ? {
    schemaVersion: reviewDataset.schemaVersion,
    facts: reviewDataset.factCount,
    pending: reviewDataset.pendingCount,
  } : null,
  nextGate: stopBeforeAdminReview ? 'ADMIN_REVIEW' : null,
  factValidation: factValidationReport?.summary || null,
  policyConflictReview: factValidationReport?.semanticConflicts?.length ? {
    decision: 'ADMIN_REVIEW_REQUIRED',
    automaticPrecedence: false,
    conflicts: factValidationReport.semanticConflicts,
  } : null,
  regressions: regressionReport ? {
    assertions: regressionReport.assertions,
    failures: regressionReport.failures.length,
    decision: regressionReport.decision,
  } : null,
}

const output = path.join(ROOT, '.local', 'after-sales', 'pipeline-report.json')
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
const normalizedFactById = new Map(
  (readJson('public/data/after-sales-normalized.json')?.facts || [])
    .map(fact => [fact.factId, fact]),
)
const genericConflictDiagnostics = (factValidationReport?.semanticConflicts || [])
  .filter(finding => finding.type === 'SEMANTIC_CONFLICT')
  .slice(0, 5)
  .map(finding => ({
    scopeKey: finding.scopeKey,
    values: finding.values,
    facts: (finding.factIds || []).slice(0, 12).map(factId => {
      const fact = normalizedFactById.get(factId)
      return fact ? {
        factId,
        factGroupId: fact.factGroupId,
        subject: fact.subject,
        batteryChemistry: fact.batteryChemistry,
        valueNumeric: fact.valueNumeric,
        unit: fact.unit,
        sourceId: fact.sourceId,
        excerpt: String(fact.provenance?.excerpt || '').slice(0, 360),
      } : { factId, missing: true }
    }),
  }))
const logReport = {
  ...report,
  policyConflictReview: report.policyConflictReview ? {
    decision: report.policyConflictReview.decision,
    automaticPrecedence: report.policyConflictReview.automaticPrecedence,
    conflicts: report.policyConflictReview.conflicts.map(finding => ({
      type: finding.type,
      scopeKey: finding.scopeKey,
      values: finding.values,
    })),
  } : null,
}
console.log(JSON.stringify(logReport, null, 2))
console.log(JSON.stringify({
  component: 'after-sales-pipeline',
  event: 'pipeline_summary',
  at: report.completedAt,
  status: report.status,
  exitCode: fatalError || degradedReasons.length || !dataValid ? 1 : 0,
  gates: report.gates,
  coverage: report.coverage,
  snapshotInventory: report.snapshotInventory,
  facts: report.normalizationV6?.normalizedFacts || report.normalization?.normalizedFacts || 0,
  evidence: report.normalizationV6?.evidenceCount || report.normalization?.evidenceCount || 0,
  rawAnchoredEvidence: report.normalizationV6Validation?.rawAnchoredEvidence || 0,
  factValidation: report.factValidation,
  normalizationV6Validation: report.normalizationV6Validation,
  serviceLocations: report.serviceLocations,
  regressions: report.regressions,
  unresolvedConflictScopes: (normalizedV6Report?.semanticConflicts || []).map(finding => ({
    type: finding.type,
    scopeKey: finding.scopeKey,
    values: finding.values,
  })),
  genericConflictDiagnostics,
  nextGate: report.nextGate,
}))
if (fatalError || degradedReasons.length || !dataValid) process.exitCode = 1
