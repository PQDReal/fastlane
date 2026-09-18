import crypto from 'node:crypto'
import { stableEvidenceId } from './after-sales-approval.mjs'

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).sort().join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function digest(value) {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex')
}

const field = (row, camel, snake = camel) => row?.[camel] ?? row?.[snake] ?? null

export function semanticIdentitySnapshot(normalized) {
  return (normalized.facts || [])
    .map(fact => ({
      factId: fact.factId,
      canonicalKey: fact.canonicalKey,
      factGroupId: fact.factGroupId,
      intervalGroupId: fact.intervalGroupId || null,
      evidenceIds: (fact.provenances || []).map(stableEvidenceId).sort(),
    }))
    .sort((a, b) => a.factId.localeCompare(b.factId))
}

export function semanticIdentityFingerprint(normalized) {
  return digest(semanticIdentitySnapshot(normalized))
}

export function semanticScopeKey(row) {
  return [
    field(row, 'serviceType', 'service_type'),
    field(row, 'vehicleType', 'vehicle_type'),
    field(row, 'powertrain'),
    field(row, 'model') || 'all_models',
    field(row, 'subject'),
    field(row, 'batteryChemistry', 'battery_chemistry') || 'not_applicable',
    field(row, 'usageCondition', 'usage_condition'),
    field(row, 'applicability'),
    field(row, 'action'),
    field(row, 'factType', 'fact_type'),
    field(row, 'unit'),
  ].join('|')
}

function semanticConflictScopeKey(row) {
  const serviceType = field(row, 'serviceType', 'service_type')
  return [
    semanticScopeKey(row),
    serviceType === 'maintenance'
      ? field(row, 'intervalRelation', 'interval_relation') || 'standalone'
      : 'policy',
  ].join('|')
}

function assetName(value) {
  try {
    return new URL(value).pathname.split('/').filter(Boolean).at(-1) || null
  } catch {
    return null
  }
}

function conflictCandidate(fact) {
  const provenances = fact.provenances?.length
    ? fact.provenances
    : fact.provenance
      ? [fact.provenance]
      : []
  return {
    factId: field(fact, 'factId', 'fact_id'),
    valueNumeric: field(fact, 'valueNumeric', 'value_numeric'),
    originKinds: [...new Set(provenances.map(item => item.origin).filter(Boolean))].sort(),
    sourceIds: [...new Set([
      ...(fact.sourceIds || []),
      ...provenances.map(item => item.sourceId),
    ].filter(Boolean))].sort(),
    assetNames: [...new Set(provenances.map(item => assetName(item.assetUrl)).filter(Boolean))].sort(),
    capturedAt: [...new Set(provenances.map(item => item.capturedAt).filter(Boolean))].sort(),
  }
}

function semanticConflictType(candidates) {
  const origins = new Set(candidates.flatMap(candidate => candidate.originKinds))
  if (origins.has('snapshot_page_text') && origins.has('asset_text_extraction')) {
    return 'OFFICIAL_PAGE_DOCUMENT_CONFLICT'
  }
  if (origins.has('manifest_transcription')) return 'MANUAL_TRANSCRIPTION_CONFLICT'
  return 'SEMANTIC_CONFLICT'
}

export function classifyFactLifecycle(desiredFacts = [], existingFacts = []) {
  const desired = new Map(desiredFacts.map(fact => [field(fact, 'factId', 'fact_id'), fact]))
  const existing = new Map(existingFacts.map(fact => [field(fact, 'factId', 'fact_id'), fact]))
  const existingByScope = new Map()
  for (const fact of existing.values()) {
    const key = semanticScopeKey(fact)
    if (!existingByScope.has(key)) existingByScope.set(key, [])
    existingByScope.get(key).push(fact)
  }

  const newlyObserved = []
  const stillObserved = []
  const superseded = []
  const ambiguousSupersession = []
  const matchedExistingIds = new Set()

  for (const fact of desired.values()) {
    const factId = field(fact, 'factId', 'fact_id')
    const current = existing.get(factId)
    if (current) {
      matchedExistingIds.add(factId)
      stillObserved.push({ factId, canonicalKey: field(fact, 'canonicalKey', 'canonical_key') })
      continue
    }
    const replacements = existingByScope.get(semanticScopeKey(fact)) || []
    if (replacements.length) {
      const desiredFactGroupId = field(fact, 'factGroupId', 'fact_group_id')
      const desiredIntervalGroupId = field(fact, 'intervalGroupId', 'interval_group_id')
      const sameFactGroup = desiredFactGroupId
        ? replacements.filter(previous => field(previous, 'factGroupId', 'fact_group_id') === desiredFactGroupId)
        : []
      const sameIntervalGroup = desiredIntervalGroupId
        ? replacements.filter(previous => field(previous, 'intervalGroupId', 'interval_group_id') === desiredIntervalGroupId)
        : []
      const candidates = sameFactGroup.length ? sameFactGroup : sameIntervalGroup.length ? sameIntervalGroup : replacements
      if (candidates.length !== 1) {
        newlyObserved.push({ factId, canonicalKey: field(fact, 'canonicalKey', 'canonical_key') })
        ambiguousSupersession.push({
          replacementFactId: factId,
          replacementCanonicalKey: field(fact, 'canonicalKey', 'canonical_key'),
          candidateFactIds: candidates.map(previous => field(previous, 'factId', 'fact_id')).sort(),
        })
        continue
      }
      for (const previous of candidates) {
        const previousId = field(previous, 'factId', 'fact_id')
        matchedExistingIds.add(previousId)
        superseded.push({
          previousFactId: previousId,
          previousCanonicalKey: field(previous, 'canonicalKey', 'canonical_key'),
          replacementFactId: factId,
          replacementCanonicalKey: field(fact, 'canonicalKey', 'canonical_key'),
        })
      }
    } else {
      newlyObserved.push({ factId, canonicalKey: field(fact, 'canonicalKey', 'canonical_key') })
    }
  }

  const noLongerObserved = []
  for (const fact of existing.values()) {
    const factId = field(fact, 'factId', 'fact_id')
    if (matchedExistingIds.has(factId) || desired.has(factId)) continue
    noLongerObserved.push({ factId, canonicalKey: field(fact, 'canonicalKey', 'canonical_key') })
  }

  return {
    newlyObserved,
    stillObserved,
    superseded,
    ambiguousSupersession,
    noLongerObserved,
    reviewRequired: superseded.length > 0 || ambiguousSupersession.length > 0 || noLongerObserved.length > 0,
    summary: {
      newlyObserved: newlyObserved.length,
      stillObserved: stillObserved.length,
      superseded: superseded.length,
      ambiguousSupersession: ambiguousSupersession.length,
      noLongerObserved: noLongerObserved.length,
    },
  }
}

export function detectSemanticConflicts(facts = []) {
  const groups = new Map()
  for (const fact of facts) {
    const key = semanticConflictScopeKey(fact)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(fact)
  }
  const findings = []
  for (const [key, group] of groups) {
    const values = [...new Set(group.map(fact => String(field(fact, 'valueNumeric', 'value_numeric'))))]
    if (values.length < 2) continue
    // A single source statement can intentionally enumerate several
    // checkpoints (for example 12, 24 and 36 months). Those facts share a
    // factGroupId and are not contradictory merely because their values
    // differ. Only compare independently grouped observations here; an
    // explicit fact group remains available for higher-level review.
    const factGroupIds = new Set(
      group
        .map(fact => field(fact, 'factGroupId', 'fact_group_id'))
        .filter(Boolean),
    )
    if (factGroupIds.size === 1 && group.every(fact => field(fact, 'factGroupId', 'fact_group_id'))) continue
    const candidates = group.map(conflictCandidate)
    findings.push({
      type: semanticConflictType(candidates),
      scopeKey: key,
      values,
      factGroupIds: [...factGroupIds].sort(),
      factIds: group.map(fact => field(fact, 'factId', 'fact_id')),
      candidates,
      resolutionPolicy: 'admin_review_required_no_automatic_precedence',
    })
  }
  return findings.sort((a, b) => a.scopeKey.localeCompare(b.scopeKey))
}

export function validateImportRelationships(plan) {
  const errors = []
  const sources = new Set((plan.tables?.sources?.rows || []).map(item => item.row.source_id))
  const assets = new Set((plan.tables?.assets?.rows || []).map(item => item.row.asset_id))
  for (const item of plan.tables?.facts?.rows || []) {
    if (!sources.has(item.row.primary_source_id)) errors.push(`fact ${item.row.fact_id} references missing source ${item.row.primary_source_id}`)
  }
  for (const item of plan.tables?.evidence?.rows || []) {
    if (!sources.has(item.row.source_id)) errors.push(`evidence ${item.row.evidence_id} references missing source ${item.row.source_id}`)
    if (item.row.asset_id && !assets.has(item.row.asset_id)) errors.push(`evidence ${item.row.evidence_id} references missing asset ${item.row.asset_id}`)
  }
  return errors
}
