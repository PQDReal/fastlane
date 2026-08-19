import { classifyFactLifecycle } from './after-sales-persistence-audit.mjs'

const TABLE_NAMES = ['sources', 'assets', 'facts', 'evidence', 'approvals']

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).sort().join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function rowsBy(rows, key) {
  return new Map((rows || []).map(row => [row[key], row]))
}

function classifyRows(desired, existing, key) {
  const existingByKey = rowsBy(existing, key)
  const result = { inserts: 0, updates: 0, unchanged: 0, rows: [] }
  for (const row of desired) {
    const current = existingByKey.get(row[key])
    if (!current) {
      result.inserts++
      result.rows.push({ action: 'insert', row })
    } else if (stableJson(current) === stableJson(row)) {
      result.unchanged++
      result.rows.push({ action: 'unchanged', row })
    } else {
      result.updates++
      result.rows.push({ action: 'update', row, current })
    }
  }
  return result
}

function factRow(fact) {
  return {
    fact_id: fact.factId,
    fact_group_id: fact.factGroupId,
    canonical_key: fact.canonicalKey,
    primary_source_id: fact.sourceId,
    source_ids: fact.sourceIds,
    service_type: fact.serviceType,
    vehicle_type: fact.vehicleType,
    powertrain: fact.powertrain || 'all',
    model: fact.model,
    subject: fact.subject,
    policy_entity: fact.policyEntity,
    usage_condition: fact.usageCondition,
    applicability: fact.applicability,
    action: fact.action,
    fact_type: fact.factType,
    value_numeric: fact.valueNumeric,
    value_text: fact.valueText,
    unit: fact.unit,
    qualifier: fact.qualifier,
    interval_relation: fact.intervalRelation || null,
    interval_group_id: fact.intervalGroupId || null,
    interval_group_distance_policy: fact.intervalGroupDistancePolicy || null,
    distance_policy: fact.distancePolicy || 'not_stated',
    confidence: fact.confidence,
    source_review_status: fact.sourceReviewStatus,
    semantic_flags: [...new Set(fact.semanticFlags || [])],
    group_semantic_flags: [...new Set(fact.groupSemanticFlags || [])],
    approval_status: fact.approval.status,
    reviewer_id: fact.approval.reviewerId,
    reviewed_at: fact.approval.reviewedAt,
    approved_by: fact.approval.approvedBy,
    approved_at: fact.approval.approvedAt,
    approval_note: fact.approval.note,
  }
}

function preserveExistingApproval(desired, existing) {
  if (!existing || existing.approval_status === 'pending' || existing.canonical_key !== desired.canonical_key) return desired
  return {
    ...desired,
    approval_status: existing.approval_status,
    reviewer_id: existing.reviewer_id || null,
    reviewed_at: existing.reviewed_at || null,
    approved_by: existing.approved_by || null,
    approved_at: existing.approved_at || null,
    approval_note: existing.approval_note || null,
  }
}

function sourceRow(source) {
  return {
    source_id: source.sourceId,
    source_url: source.sourceUrl,
    service_type: source.serviceType,
    vehicle_type: source.vehicleType,
    scope: source.scope,
    title: source.title,
    snapshot_id: source.snapshotId,
    snapshot_hash: source.snapshotHash,
    captured_at: source.capturedAt,
    capture_method: source.captureMethod,
    http_status: source.httpStatus,
    availability: source.availability,
  }
}

function assetRow(asset) {
  return {
    asset_id: asset.assetId,
    source_id: asset.sourceId,
    asset_url: asset.url,
    asset_type: asset.type,
    label: asset.label,
    content_hash: asset.contentHash,
    mime_type: asset.mimeType,
    byte_length: asset.byteLength,
    classification: asset.classification,
    verification: asset.verification,
  }
}

function evidenceRow(fact, evidence) {
  return {
    relationship_key: `${fact.factId}|${evidence.evidenceId}`,
    fact_id: fact.factId,
    evidence_id: evidence.evidenceId,
    source_id: evidence.sourceId,
    asset_id: evidence.assetId,
    source_url: evidence.sourceUrl,
    snapshot_hash: evidence.snapshotHash,
    captured_at: evidence.capturedAt,
    origin: evidence.origin,
    asset_url: evidence.assetUrl,
    asset_hash: evidence.assetHash,
    pdf_page: evidence.pdfPage,
    extraction_method: evidence.extractionMethod,
    extraction_confidence: evidence.extractionConfidence,
    excerpt: evidence.excerpt,
    context_index: evidence.contextIndex,
  }
}

function findDuplicates(rows, key) {
  const seen = new Set()
  const duplicates = []
  for (const row of rows) {
    const value = row[key]
    if (seen.has(value)) duplicates.push(value)
    seen.add(value)
  }
  return duplicates
}

export function buildImportPlan(dataset, existing = {}) {
  const sources = (dataset.sources || []).map(sourceRow)
  const assets = (dataset.assets || []).map(assetRow)
  const existingFacts = rowsBy(existing.facts, 'fact_id')
  const facts = (dataset.facts || []).map(fact => preserveExistingApproval(factRow(fact), existingFacts.get(fact.factId)))
  const evidence = (dataset.facts || []).flatMap(fact => (fact.evidence || []).map(item => evidenceRow(fact, item)))
  const lifecycle = classifyFactLifecycle(facts, existing.facts || [])
  const approvals = []
  const conflicts = []
  const rejectedWrites = []

  for (const [rows, key, table] of [[sources, 'source_id', 'sources'], [assets, 'asset_id', 'assets'], [facts, 'fact_id', 'facts']]) {
    const duplicates = findDuplicates(rows, key)
    if (duplicates.length) conflicts.push({ table, type: 'duplicate_identity', keys: duplicates })
  }
  const duplicateCanonicalKeys = findDuplicates(facts, 'canonical_key')
  if (duplicateCanonicalKeys.length) conflicts.push({ table: 'facts', type: 'duplicate_canonical_key', keys: duplicateCanonicalKeys })
  const duplicateEvidenceKeys = findDuplicates(evidence, 'relationship_key')
  if (duplicateEvidenceKeys.length) conflicts.push({ table: 'fact_evidence', type: 'duplicate_fact_evidence_relationship', keys: duplicateEvidenceKeys })

  const sourceIds = new Set(sources.map(row => row.source_id))
  const assetIds = new Set(assets.map(row => row.asset_id))
  for (const row of facts) {
    if (!sourceIds.has(row.primary_source_id)) conflicts.push({ table: 'facts', type: 'missing_source', key: row.fact_id, sourceId: row.primary_source_id })
  }
  for (const row of evidence) {
    if (!sourceIds.has(row.source_id)) conflicts.push({ table: 'fact_evidence', type: 'missing_source', key: row.evidence_id, sourceId: row.source_id })
    if (row.asset_id && !assetIds.has(row.asset_id)) conflicts.push({ table: 'fact_evidence', type: 'missing_asset', key: row.evidence_id, assetId: row.asset_id })
  }
  if (conflicts.length) rejectedWrites.push(...conflicts.map(conflict => ({ table: conflict.table, reason: conflict.type, key: conflict.key || conflict.keys })))

  const plan = {
    sources: classifyRows(sources, existing.sources, 'source_id'),
    assets: classifyRows(assets, existing.assets, 'asset_id'),
    facts: classifyRows(facts, existing.facts, 'fact_id'),
    evidence: classifyRows(evidence, existing.evidence, 'relationship_key'),
    approvals: classifyRows(approvals, existing.approvals, 'approval_id'),
    conflicts,
    rejectedWrites,
  }
  return {
    schemaVersion: 2,
    decision: conflicts.length ? 'REJECT' : lifecycle.reviewRequired ? 'REVIEW' : 'READY',
    conflicts,
    rejectedWrites,
    lifecycle,
    writes: 0,
    tables: Object.fromEntries(TABLE_NAMES.map(table => [table, plan[table]])),
    summary: Object.fromEntries(TABLE_NAMES.map(table => [table, {
      inserts: plan[table].inserts,
      updates: plan[table].updates,
      unchanged: plan[table].unchanged,
    }])),
  }
}
