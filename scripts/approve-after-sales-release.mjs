import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildApprovedAfterSalesRelease,
  evaluateAfterSalesReleaseReadiness,
  sha256Json,
  verifyApprovedAfterSalesRelease,
} from './lib/after-sales-release.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LOCAL = path.join(ROOT, '.local', 'after-sales')
const approve = process.argv.includes('--approve')

function argument(name, fallback = null) {
  const prefix = `--${name}=`
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length) || fallback
}

function readRequiredJson(file, label) {
  if (!fs.existsSync(file)) throw new Error(`${label} not found: ${file}`)
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function writeImmutableJson(file, value) {
  if (fs.existsSync(file)) {
    const current = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (sha256Json(current) !== sha256Json(value)) {
      throw new Error(`Refusing to overwrite immutable release artifact: ${file}`)
    }
    return
  }
  writeJson(file, value)
}

const inputPaths = {
  reviewDataset: path.join(LOCAL, 'review-dataset.json'),
  normalizedDataset: path.join(LOCAL, 'after-sales-normalized-v6.json'),
  adminReviewReport: path.join(LOCAL, 'admin-review-report.json'),
  pipelineReport: path.join(LOCAL, 'pipeline-report.json'),
  normalizedValidationReport: path.join(LOCAL, 'normalized-v6-validation-report.json'),
  assetVerificationReport: path.join(LOCAL, 'asset-verification-report.json'),
  regressionReport: path.join(LOCAL, 'regression-report.json'),
  snapshotInventoryReport: path.join(LOCAL, 'snapshot-inventory-report.json'),
  serviceLocations: path.join(LOCAL, 'service-locations', 'extracted', 'latest.json'),
  serviceLocationValidationReport: path.join(LOCAL, 'service-locations', 'validation-report.json'),
  persistenceAuditReport: path.join(LOCAL, 'persistence-hardening-report.json'),
}

const artifacts = Object.fromEntries(Object.entries(inputPaths).map(([key, file]) => [key, readRequiredJson(file, key)]))
const readiness = evaluateAfterSalesReleaseReadiness(artifacts)
const readinessReport = {
  checkedAt: new Date().toISOString(),
  mode: approve ? 'explicit-approval-requested' : 'read-only-check',
  inputs: Object.fromEntries(Object.entries(inputPaths).map(([key, file]) => [key, {
    file: path.relative(ROOT, file).replaceAll('\\', '/'),
    sha256: sha256Json(artifacts[key]),
  }])),
  ...readiness,
}
const readinessPath = path.join(LOCAL, 'release-readiness-report.json')
writeJson(readinessPath, readinessReport)

if (!approve) {
  console.log(JSON.stringify({
    mode: readinessReport.mode,
    decision: readiness.decision,
    summary: readiness.summary,
    failedGates: readiness.gates.filter(gate => gate.status === 'FAIL').map(gate => gate.id),
    report: readinessPath,
  }, null, 2))
  if (readiness.decision !== 'READY_FOR_EXPLICIT_APPROVAL') process.exitCode = 1
} else {
  const reviewerId = argument('reviewer-id')
  if (!reviewerId) throw new Error('--reviewer-id is required with --approve')
  const approvedAt = argument('approved-at', new Date().toISOString())
  const note = argument('note', 'Được admin ủy quyền review; toàn bộ hard gate đã đạt và không còn conflict cần sửa.')
  const release = buildApprovedAfterSalesRelease({ artifacts, reviewerId, approvedAt, note })
  const verification = verifyApprovedAfterSalesRelease(release)
  if (verification.decision !== 'PASS') throw new Error(`Generated release failed self-verification: ${verification.errors.join('; ')}`)

  const releaseDirectory = path.join(LOCAL, 'releases', release.manifest.releaseId)
  const manifestPath = path.join(releaseDirectory, 'release-manifest.json')
  const reviewDatasetPath = path.join(releaseDirectory, release.manifest.datasets.reviewDataset.file)
  const serviceLocationsPath = path.join(releaseDirectory, release.manifest.datasets.serviceLocations.file)
  const verificationPath = path.join(releaseDirectory, 'release-verification-report.json')
  for (const [key, value] of Object.entries(release.approvalInputs)) {
    const input = release.manifest.inputs[key]
    if (!input || input.sha256 !== sha256Json(value)) throw new Error(`Release input hash mismatch: ${key}`)
    writeImmutableJson(path.join(releaseDirectory, input.file), value)
  }
  writeImmutableJson(reviewDatasetPath, release.reviewDataset)
  writeImmutableJson(serviceLocationsPath, release.serviceLocations)
  writeImmutableJson(manifestPath, release.manifest)
  writeImmutableJson(verificationPath, { checkedAt: approvedAt, ...verification })

  const pointerPath = path.join(LOCAL, 'approved-release.json')
  writeJson(pointerPath, {
    schemaVersion: 1,
    releaseId: release.manifest.releaseId,
    manifest: path.relative(ROOT, manifestPath).replaceAll('\\', '/'),
    manifestHash: sha256Json(release.manifest),
    approvedAt,
    reviewerId,
    publicationStatus: 'NOT_PUBLISHED',
  })

  console.log(JSON.stringify({
    mode: 'explicit-admin-agent-approval',
    decision: release.manifest.decision,
    releaseId: release.manifest.releaseId,
    gateCoveragePercent: release.manifest.scope.gateCoveragePercent,
    sources: release.manifest.scope.sources,
    assets: release.manifest.scope.assets,
    facts: release.manifest.scope.facts,
    evidence: release.manifest.scope.evidence,
    serviceLocations: release.manifest.scope.serviceLocations,
    approvalEvents: release.manifest.scope.approvalEvents,
    manifest: manifestPath,
    verification: verificationPath,
    frozenInputs: Object.keys(release.approvalInputs).length,
    pointer: pointerPath,
    publicationStatus: release.manifest.publication.status,
  }, null, 2))
}
