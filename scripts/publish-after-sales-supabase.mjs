import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { buildImportPlan } from './lib/after-sales-importer.mjs'
import { sha256Json, verifyApprovedAfterSalesRelease } from './lib/after-sales-release.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LOCAL = path.join(ROOT, '.local', 'after-sales')
const APPLY = process.argv.includes('--apply')

function argument(name, fallback = null) {
  const prefix = `--${name}=`
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length) || fallback
}

function readJson(file, label) {
  if (!fs.existsSync(file)) throw new Error(`${label} not found: ${file}`)
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeReport(value) {
  const reportPath = path.join(LOCAL, 'supabase-publish-report.json')
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  return reportPath
}

function rows(plan, table) {
  return plan.tables[table].rows.map(entry => entry.row)
}

function serviceLocationRow(location, dataset, releaseId) {
  return {
    location_id: location.id,
    release_id: releaseId,
    source_snapshot_id: dataset.sourceSnapshotId,
    source_system: location.sourceSystem,
    upstream_identity: location.upstreamIdentity,
    name: location.name,
    location_type: location.locationType,
    location_category: location.locationCategory,
    category_label: location.categoryLabel,
    vehicle_types: location.vehicleTypes,
    service_types: location.serviceTypes,
    bookable_service_types: [],
    capability_granularity: location.capabilityGranularity,
    address: location.address,
    contact: location.contact,
    service_hours: location.serviceHours,
    booking_actions: [],
    operational_status: location.status,
    status_basis: location.statusBasis,
    review_status: location.reviewStatus,
    evidence: location.evidence,
    approved_by: location.approvedBy,
    approved_at: location.approvedAt,
  }
}

const pointerPath = path.resolve(argument('pointer', path.join(LOCAL, 'approved-release.json')))
const pointer = readJson(pointerPath, 'Approved release pointer')
const manifestPath = path.resolve(argument('manifest', path.join(ROOT, pointer.manifest)))
const manifest = readJson(manifestPath, 'Release manifest')
if (pointer.releaseId !== manifest.releaseId || pointer.manifestHash !== sha256Json(manifest)) {
  throw new Error('Approved release pointer does not match the immutable manifest')
}

const releaseDirectory = path.dirname(manifestPath)
const reviewDataset = readJson(path.join(releaseDirectory, manifest.datasets.reviewDataset.file), 'Approved review dataset')
const serviceLocations = readJson(path.join(releaseDirectory, manifest.datasets.serviceLocations.file), 'Approved service locations')
const releaseVerification = verifyApprovedAfterSalesRelease({ manifest, reviewDataset, serviceLocations })
if (releaseVerification.decision !== 'PASS') {
  throw new Error(`Approved release verification failed: ${releaseVerification.errors.join('; ')}`)
}

const importPlan = buildImportPlan(reviewDataset, {}, { requireApproved: true })
if (importPlan.decision !== 'READY') {
  throw new Error(`Strict import plan is ${importPlan.decision}: ${JSON.stringify(importPlan.rejectedWrites)}`)
}

const releaseId = manifest.releaseId
const publicationRows = {
  sources: rows(importPlan, 'sources'),
  assets: rows(importPlan, 'assets'),
  facts: rows(importPlan, 'facts').map(row => ({ ...row, release_id: releaseId })),
  evidence: rows(importPlan, 'evidence').map(({ relationship_key: _relationshipKey, ...row }) => ({ ...row, release_id: releaseId })),
  approvals: rows(importPlan, 'approvals').map(row => ({ ...row, release_id: releaseId })),
  service_locations: serviceLocations.records.map(location => serviceLocationRow(location, serviceLocations, releaseId)),
}
const dataPayload = { manifest, ...publicationRows }
const releaseMetadata = {
  release_id: releaseId,
  manifest_hash: sha256Json(manifest),
  payload_hash: sha256Json(dataPayload),
  review_dataset_hash: manifest.datasets.reviewDataset.sha256,
  service_locations_hash: manifest.datasets.serviceLocations.sha256,
  approved_by: manifest.reviewer.id,
  approved_at: manifest.approvedAt,
  counts: {
    sources: publicationRows.sources.length,
    assets: publicationRows.assets.length,
    facts: publicationRows.facts.length,
    evidence: publicationRows.evidence.length,
    approvals: publicationRows.approvals.length,
    serviceLocations: publicationRows.service_locations.length,
  },
}
const payload = { release: releaseMetadata, ...dataPayload }
const baseReport = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: APPLY ? 'apply' : 'dry-run',
  releaseId,
  manifest: path.relative(ROOT, manifestPath).replaceAll('\\', '/'),
  releaseVerification,
  importDecision: importPlan.decision,
  approvalPolicy: importPlan.approvalPolicy,
  payloadHash: releaseMetadata.payload_hash,
  counts: releaseMetadata.counts,
  requiredMigration: '061_after_sales_release_publication.sql',
  requiredRpc: 'publish_after_sales_release',
}

if (!APPLY) {
  const report = {
    ...baseReport,
    decision: 'READY_TO_APPLY',
    writes: 0,
    note: 'Dry-run only; Supabase was not contacted and no database row was changed.',
  }
  const reportPath = writeReport(report)
  console.log(JSON.stringify({ ...report, report: reportPath }, null, 2))
} else {
  const confirmationReleaseId = argument('release-id', process.env.AFTER_SALES_PUBLISH_RELEASE_ID)
  if (confirmationReleaseId !== releaseId) {
    throw new Error(`Apply requires --release-id=${releaseId} (or matching AFTER_SALES_PUBLISH_RELEASE_ID)`)
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.rpc('publish_after_sales_release', { p_payload: payload })
  if (error) {
    const reportPath = writeReport({
      ...baseReport,
      decision: 'FAILED',
      writes: 0,
      error: { code: error.code || null, message: error.message, details: error.details || null, hint: error.hint || null },
    })
    throw new Error(`Atomic Supabase publication failed; report: ${reportPath}; ${error.message}`)
  }

  const { data: persistedRelease, error: verificationError } = await supabase
    .from('after_sales_publication_releases')
    .select('release_id, manifest_hash, payload_hash, status, published_at')
    .eq('release_id', releaseId)
    .single()
  if (verificationError
    || persistedRelease?.manifest_hash !== releaseMetadata.manifest_hash
    || persistedRelease?.payload_hash !== releaseMetadata.payload_hash
    || persistedRelease?.status !== 'published') {
    const reportPath = writeReport({
      ...baseReport,
      decision: 'VERIFY_FAILED',
      writes: data?.counts || null,
      rpcResult: data || null,
      verificationError: verificationError?.message || null,
    })
    throw new Error(`Supabase post-publication verification failed; report: ${reportPath}`)
  }

  const report = {
    ...baseReport,
    decision: 'PUBLISHED',
    writes: data?.counts || releaseMetadata.counts,
    rpcResult: data,
    persistedRelease,
  }
  const reportPath = writeReport(report)
  console.log(JSON.stringify({ ...report, report: reportPath }, null, 2))
}
