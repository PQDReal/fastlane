import crypto from 'node:crypto'
import { reindexSerializedEvidenceContext } from './after-sales-evidence-context.mjs'
import {
  statementPrefixThroughValue,
  valueLocalRowPrefix,
} from './after-sales-statement-scope.mjs'

export const DEFAULT_MODEL_POWERTRAINS = Object.freeze({
  Fadil: 'petrol',
  'Lux A 2.0': 'petrol',
  'Lux SA 2.0': 'petrol',
  President: 'petrol',
  'Lạc Hồng 900LX': 'electric',
  'VF 3': 'electric',
  'VF 5': 'electric',
  'VF 6': 'electric',
  'VF 7': 'electric',
  'VF 8': 'electric',
  'VF 8 The All New': 'electric',
  'VF 9': 'electric',
  'VF e34': 'electric',
  'VF EC Van': 'electric',
  'VF Herio Green': 'electric',
  'VF Limo Green': 'electric',
  'VF Minio Green': 'electric',
  'VF MPV7': 'electric',
  'VF Nerio Green': 'electric',
})

const REMOVED_FACT_IDS = new Set(['af_fact_7b3b4be95c210a257f40'])

const MODEL_PATTERNS = [
  ['VF 8 The All New', /\bvf\s*8\s*the\s*all\s*new\b/iu],
  ['Lạc Hồng 900LX', /\bl(?:ạ|a)c\s*h(?:ồ|o)ng\s*900lx\b/iu],
  ['Lux SA 2.0', /\blux\s*sa(?:\s*2[.]?0)?\b/iu],
  ['Lux A 2.0', /\blux\s*a(?:\s*2[.]?0)?\b/iu],
  ['VF Herio Green', /\b(?:vf\s*)?herio\s*green\b/iu],
  ['VF Limo Green', /\b(?:vf\s*)?limo\s*green\b/iu],
  ['VF Minio Green', /\b(?:vf\s*)?minio\s*green\b/iu],
  ['VF Nerio Green', /\b(?:vf\s*)?nerio\s*green\b/iu],
  ['VF EC Van', /\b(?:vf\s*)?ec\s*van\b/iu],
  ['VF MPV7', /\bvf\s*mpv\s*7\b/iu],
  ['VF e34', /\bvf\s*e34\b/iu],
  ['President', /\bpresident\b/iu],
  ['Fadil', /\bfadil\b/iu],
  ['VF 3', /\bvf\s*3\b/iu],
  ['VF 5', /\bvf\s*5\b/iu],
  ['VF 6', /\bvf\s*6\b/iu],
  ['VF 7', /\bvf\s*7\b/iu],
  ['VF 8', /\bvf\s*8\b(?!\s*the\s*all\s*new)/iu],
  ['VF 9', /\bvf\s*9\b/iu],
]

const ASSET_MODEL_PATTERNS = [
  [/vf3-erg/iu, 'VF 3'],
  [/vf6.*erg/iu, 'VF 6'],
  [/vf7.*(?:manual|electric|170962)/iu, 'VF 7'],
  [/(?:^|[/_])vf3(?:[_-]|$)|svc69000164/iu, 'VF 3'],
  [/vf5|svc73000155/iu, 'VF 5'],
  [/herio|svc73000217/iu, 'VF Herio Green'],
  [/nerio|svc20000368/iu, 'VF Nerio Green'],
  [/limogreen|limo7/iu, 'VF Limo Green'],
  [/lh-900lx/iu, 'Lạc Hồng 900LX'],
  [/mgreen/iu, 'VF Minio Green'],
  [/ecvan/iu, 'VF EC Van'],
  [/mpv7/iu, 'VF MPV7'],
  [/vf8/iu, 'VF 8'],
  [/vf9/iu, 'VF 9'],
  [/fadil/iu, 'Fadil'],
  [/lux%20a|lux[_ ]a/iu, 'Lux A 2.0'],
  [/lux%20sa|lux[_ ]sa/iu, 'Lux SA 2.0'],
  [/president/iu, 'President'],
]

const PRIMARY_ORIGIN_ORDER = new Map([
  ['asset_text_extraction', 0],
  ['snapshot_page_text', 1],
  ['manifest_transcription', 2],
])

function hash(prefix, value, length = 20) {
  return `${prefix}${crypto.createHash('sha256').update(value).digest('hex').slice(0, length)}`
}

function unique(values) {
  return [...new Set(values)]
}

function mergeAlternativeTriggers(facts) {
  const triggers = facts
    .flatMap(fact => Array.isArray(fact.alternativeTriggers) ? fact.alternativeTriggers : [])
    .filter(trigger => trigger?.type === 'event' && trigger?.code && trigger?.sourceText)
    .sort((left, right) => String(left.code).localeCompare(String(right.code)) || String(left.sourceText).localeCompare(String(right.sourceText), 'vi'))
  const byCode = new Map()
  for (const trigger of triggers) {
    if (byCode.has(trigger.code)) continue
    byCode.set(trigger.code, {
      type: 'event',
      code: String(trigger.code),
      sourceText: String(trigger.sourceText).replace(/\s+/gu, ' ').trim(),
    })
  }
  return [...byCode.values()]
}

function clone(value) {
  return structuredClone(value)
}

function evidenceText(fact) {
  return (fact.provenances || []).map(item => item.excerpt || '').join(' ')
}

function evidenceMatchBounds(provenance) {
  const index = provenance?.contextIndex
  if (!Number.isInteger(index?.matchStart) || !Number.isInteger(index?.matchEnd)) return null
  const offset = index.offsetBasis === 'source_text_utf16' && Number.isInteger(index.excerptStart)
    ? index.excerptStart
    : 0
  return {
    matchStart: index.matchStart - offset,
    matchEnd: index.matchEnd - offset,
  }
}

function scopedEvidenceText(fact, provenance, mode = 'prefix') {
  const excerpt = provenance?.excerpt || ''
  const bounds = evidenceMatchBounds(provenance)
  return mode === 'row'
    ? valueLocalRowPrefix(excerpt, fact.valueText, bounds)
    : statementPrefixThroughValue(excerpt, fact.valueText, bounds)
}

function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/giu, 'd')
    .toLocaleLowerCase('vi')
}

function provenanceFingerprint(provenance) {
  const identity = [
    provenance.origin,
    provenance.sourceId,
    provenance.sourceUrl,
    provenance.snapshotHash,
    provenance.assetUrl,
    provenance.assetHash,
    provenance.pdfPage,
    provenance.extractionMethod,
    provenance.excerpt,
  ]
  return crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex')
}

function semanticSignature(fact) {
  return JSON.stringify([
    fact.serviceType,
    fact.vehicleType,
    fact.subject,
    fact.batteryChemistry || 'not_applicable',
    fact.usageCondition,
    fact.applicability,
    fact.action,
    fact.factType,
    fact.valueNumeric,
    fact.unit,
  ])
}

function dedupeSignature(fact) {
  const valueNumeric = fact.unit === 'month' && Number(fact.valueNumeric) % 12 === 0
    ? Number(fact.valueNumeric) / 12
    : fact.valueNumeric
  const unit = fact.unit === 'month' && Number(fact.valueNumeric) % 12 === 0 ? 'year' : fact.unit
  return JSON.stringify([
    fact.serviceType,
    fact.vehicleType,
    fact.powertrain,
    fact.model,
    fact.subject,
    fact.batteryChemistry || 'not_applicable',
    fact.usageCondition,
    fact.applicability,
    fact.action,
    fact.factType,
    valueNumeric,
    unit,
  ])
}

export function extractMentionedModels(text) {
  const source = String(text || '')
  return MODEL_PATTERNS.filter(([, pattern]) => pattern.test(source)).map(([model]) => model)
}

export function inferAssetModel(assetUrl) {
  const value = String(assetUrl || '')
  return ASSET_MODEL_PATTERNS.find(([pattern]) => pattern.test(value))?.[1] || null
}

function normalizePowertrain(fact, modelPowertrains) {
  if (fact.model && modelPowertrains[fact.model]) return modelPowertrains[fact.model]
  if (fact.vehicleType === 'motorbike') return 'electric'
  if (fact.subject === 'battery' || fact.action === 'high_voltage_discharge_wait') return 'electric'
  return fact.powertrain || 'all'
}

function normalizeBatteryChemistry(fact) {
  if (fact.subject !== 'battery') return 'not_applicable'
  return ['lfp', 'non_lfp', 'unspecified'].includes(fact.batteryChemistry)
    ? fact.batteryChemistry
    : 'unspecified'
}

function normalizeUsage(fact) {
  const text = fold((fact.provenances || []).map(provenance => scopedEvidenceText(fact, provenance)).join(' '))
    .replace(/\s+/gu, ' ')
  if (fact.factType === 'battery_capacity_threshold') return 'general'
  if (fact.serviceType !== 'warranty') return fact.usageCondition || 'general'
  if (fact.applicability === 'customer_paid_replacement') return 'general'
  // A standard-use clause often says "except commercial use" before giving
  // its own term. Presence of the words alone must not flip the claim.
  if (/ngoai\s+tru.{0,120}thuong\s+mai/u.test(text)) return 'standard_use'
  if (/(?:su\s+dung|ap\s+dung).{0,100}(?:dich\s+vu\s+)?thuong\s+mai/u.test(text)) return 'commercial_use'
  if (fact.usageCondition === 'commercial_use') return 'commercial_use'
  if (fact.usageCondition === 'general') return 'standard_use'
  return fact.usageCondition || 'standard_use'
}

function normalizeKnownSemanticDefects(fact) {
  const semanticText = fold((fact.provenances || [fact.provenance])
    .filter(Boolean)
    .map(provenance => provenance.excerpt || '')
    .join(' '))
  const replacementBatteryChemistry = /\bpin\s+lfp\s*:/u.test(semanticText)
    ? 'lfp'
    : /\bpin\s+khac\s*\(\s*khong\s+phai\s+pin\s+lfp\s*\)\s*:/u.test(semanticText)
      ? 'non_lfp'
      : null
  if (fact.serviceType === 'warranty' && fact.vehicleType === 'motorbike' && replacementBatteryChemistry) {
    fact.subject = 'battery'
    fact.policyEntity = 'battery'
    fact.batteryChemistry = replacementBatteryChemistry
    fact.powertrain = 'electric'
    fact.factType = fact.unit === 'km' ? 'battery_warranty_distance' : 'battery_warranty_duration'
  }
  if (fact.factId === 'af_fact_bbf7c7a92434ce06beba') {
    fact.subject = 'battery'
    fact.policyEntity = 'battery'
    fact.powertrain = 'electric'
  }
  if (fact.factId === 'af_fact_4c60a4f3c859bbbb1579') {
    fact.subject = 'steering_head_bearing'
    fact.policyEntity = 'steering_head_bearing'
  }
  if (fact.factId === 'af_fact_4cee4a0f9b8027cebb42') {
    fact.subject = 'seat_lock_and_stands'
    fact.policyEntity = 'seat_lock_and_stands'
  }
  if (fact.factId === 'af_fact_aad6c3a76405bb80d35b') {
    fact.applicability = 'vpoint_appointment_promotion'
    fact.qualifier = 'promotion_eligibility_only'
    fact.semanticFlags = unique([...(fact.semanticFlags || []), 'PROMOTION_SCOPED'])
  }
  return fact
}

function splitAssetScopedFacts(facts) {
  const result = []
  for (const fact of facts) {
    if (fact.model) {
      result.push(fact)
      continue
    }
    const buckets = new Map()
    const unscoped = []
    for (const provenance of fact.provenances || []) {
      const model = inferAssetModel(provenance.assetUrl)
      if (!model) unscoped.push(provenance)
      else buckets.set(model, [...(buckets.get(model) || []), provenance])
    }
    if (!buckets.size) {
      result.push(fact)
      continue
    }
    for (const [model, provenances] of buckets) {
      result.push({
        ...clone(fact),
        model,
        provenances,
        provenance: provenances[0],
      })
    }
    if (unscoped.length) result.push({ ...clone(fact), provenances: unscoped, provenance: unscoped[0] })
  }
  return result
}

function expandMultiModelEvidence(facts) {
  const evidenceGroups = new Map()
  for (const fact of facts) {
    for (const provenance of fact.provenances || []) {
      if (provenance.origin !== 'snapshot_page_text') continue
      const models = extractMentionedModels(scopedEvidenceText(fact, provenance, 'row'))
      if (models.length < 2) continue
      const key = `${provenanceFingerprint(provenance)}|${semanticSignature(fact)}`
      const current = evidenceGroups.get(key) || { models, provenance, facts: [] }
      current.facts.push(fact)
      evidenceGroups.set(key, current)
    }
  }

  for (const group of evidenceGroups.values()) {
    const template = group.facts[0]
    for (const model of group.models) {
      const target = facts.find(fact => fact.model === model && semanticSignature(fact) === semanticSignature(template))
      if (target) {
        target.provenances = [...(target.provenances || []), clone(group.provenance)]
      } else {
        facts.push({
          ...clone(template),
          model,
          powertrain: null,
          provenances: [clone(group.provenance)],
          provenance: clone(group.provenance),
        })
      }
    }
  }
  return facts
}

function normalizeDistanceAndQualifier(fact) {
  const text = fold(evidenceText(fact))
  const hasWhichever = /tuy.{0,80}(?:dieu kien)?.{0,40}den truoc/u.test(text)
  if (hasWhichever) fact.qualifier = 'whichever_comes_first'
  if (/khong gioi han\s+(?:quang duong(?:\s+su dung)?|so\s*km|km)\b/u.test(text)) fact.distancePolicy = 'unlimited'
  if (fact.factType === 'battery_capacity_threshold') fact.qualifier = 'minimum'

  if (fact.intervalRelation === 'or') {
    if (fact.unit === 'km') fact.distancePolicy = 'limited'
    else fact.distancePolicy = 'not_stated'
    fact.intervalGroupDistancePolicy = 'limited'
  }
  if (fact.unit === 'km' && fact.distancePolicy !== 'unlimited') fact.distancePolicy = 'limited'
  if (fact.unit !== 'km' && !fact.distancePolicy) fact.distancePolicy = 'not_stated'
  return fact
}

function prepareProvenance(fact, provenance) {
  const value = clone(provenance)
  value.sourceValueText = value.sourceValueText || fact.valueText
  if (['snapshot_page_text', 'asset_text_extraction'].includes(value.origin)) {
    const hasRawAnchor = value.contextIndex?.version === 'after-sales-evidence-context-v2'
      && value.contextIndex?.sourceOffsetsVerified === true
      && value.contextIndex?.sourceAnchor?.kind
    if (hasRawAnchor) return value
    const repaired = reindexSerializedEvidenceContext(value.excerpt, value.sourceValueText, value.contextIndex)
    if (!repaired.matched) {
      throw new Error(`Cannot reindex evidence for ${fact.factId}: ${value.sourceValueText}`)
    }
    value.contextIndex = repaired.contextIndex
  }
  return value
}

function mergeFacts(facts) {
  const groups = new Map()
  for (const fact of facts) {
    const key = dedupeSignature(fact)
    groups.set(key, [...(groups.get(key) || []), fact])
  }

  const merged = []
  for (const group of groups.values()) {
    const primary = clone(group[0])
    const provenanceMap = new Map()
    for (const fact of group) {
      for (const provenance of fact.provenances || []) {
        const prepared = prepareProvenance(fact, provenance)
        provenanceMap.set(provenanceFingerprint(prepared), prepared)
      }
    }
    primary.provenances = [...provenanceMap.values()].sort((left, right) => {
      const leftOrder = PRIMARY_ORIGIN_ORDER.get(left.origin) ?? 99
      const rightOrder = PRIMARY_ORIGIN_ORDER.get(right.origin) ?? 99
      return leftOrder - rightOrder || provenanceFingerprint(left).localeCompare(provenanceFingerprint(right))
    })
    primary.semanticFlags = unique(group.flatMap(fact => fact.semanticFlags || []))
    primary.groupSemanticFlags = unique(group.flatMap(fact => fact.groupSemanticFlags || []))
    primary.alternativeTriggers = mergeAlternativeTriggers(group)
    primary.sourceFactGroupIds = unique(group.map(fact => fact.factGroupId).filter(Boolean)).sort()
    primary.confidence = Math.max(...group.map(fact => Number(fact.confidence) || 0))
    primary.supersedesFactIds = unique(group.map(fact => fact.factId).filter(Boolean)).sort()
    primary.reviewStatus = primary.provenances.every(item => item.origin === 'manifest_transcription')
      ? 'pending_admin_review'
      : 'pending'
    primary.reviewReasons = primary.reviewStatus === 'pending_admin_review' ? ['MANUAL_ONLY_SOURCE'] : []
    primary.publicationStatus = primary.reviewStatus === 'pending_admin_review' ? 'held' : 'review_required'
    merged.push(normalizeDistanceAndQualifier(primary))
  }
  return merged
}

function canonicalKey(fact) {
  return [
    fact.vehicleType,
    fact.powertrain,
    fact.model || 'all_models',
    fact.subject,
    fact.batteryChemistry || 'not_applicable',
    fact.usageCondition,
    fact.applicability,
    fact.action,
    fact.factType,
    fact.valueNumeric,
    fact.unit,
    fact.distancePolicy,
    fact.qualifier || '',
  ].join('|')
}

function finalizeIdentity(fact) {
  fact.canonicalKey = canonicalKey(fact)
  fact.factId = hash('af_fact_', `after-sales-fact-v6|${fact.canonicalKey}`)
  const legacyGroups = fact.sourceFactGroupIds?.length
    ? unique(fact.sourceFactGroupIds).sort()
    : unique((fact.supersedesFactIds || []).map(id => id || '')).sort()
  const groupScope = [
    fact.serviceType,
    fact.vehicleType,
    fact.subject,
    fact.batteryChemistry || 'not_applicable',
    fact.usageCondition,
    fact.applicability,
    fact.action,
  ].join('|')
  fact.factGroupId = hash('af_group_', `after-sales-group-v6|${legacyGroups.join('|')}|${groupScope}`, 16)
  if (fact.intervalGroupId) {
    fact.intervalGroupId = hash('af_interval_', `after-sales-interval-v6|${fact.model || 'all_models'}|${fact.subject}|${fact.action}|${fact.intervalGroupId}`, 16)
  }
  fact.provenance = fact.provenances[0]
  fact.sourceIds = unique(fact.provenances.map(item => item.sourceId))
  fact.sourceId = fact.provenance.sourceId
  fact.evidenceCount = fact.provenances.length
  return fact
}

function ensureUniqueCanonicalKeys(facts) {
  const seen = new Set()
  for (const fact of facts) {
    if (seen.has(fact.canonicalKey)) throw new Error(`Duplicate canonical key after correction: ${fact.canonicalKey}`)
    seen.add(fact.canonicalKey)
  }
}

export function correctNormalizedDataset(input, {
  modelPowertrains = DEFAULT_MODEL_POWERTRAINS,
  normalizedAt = new Date().toISOString(),
} = {}) {
  const sourceFacts = input.facts || []
  let facts = sourceFacts
    .filter(fact => !REMOVED_FACT_IDS.has(fact.factId))
    .map(fact => {
      const normalized = normalizeKnownSemanticDefects(clone(fact))
      normalized.batteryChemistry = normalizeBatteryChemistry(normalized)
      return normalized
    })

  facts = splitAssetScopedFacts(facts)
  facts = expandMultiModelEvidence(facts)
  facts = facts.map(fact => {
    fact.usageCondition = normalizeUsage(fact)
    fact.powertrain = normalizePowertrain(fact, modelPowertrains)
    return normalizeDistanceAndQualifier(fact)
  })
  const candidateFacts = facts.length
  facts = mergeFacts(facts)
  facts = facts.map(fact => {
    fact.powertrain = normalizePowertrain(fact, modelPowertrains)
    return finalizeIdentity(fact)
  }).sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey))

  ensureUniqueCanonicalKeys(facts)

  const normalizedFacts = facts.length
  const duplicateCandidatesMerged = Math.max(0, candidateFacts - normalizedFacts)
  const machineEvidence = facts.flatMap(fact => fact.provenances || [])
    .filter(provenance => provenance.origin !== 'manifest_transcription')
  const rawAnchoredEvidence = machineEvidence.filter(provenance => (
    provenance.contextIndex?.sourceOffsetsVerified === true
    && provenance.contextIndex?.sourceAnchor?.kind
  )).length
  const rawCorpusAvailable = rawAnchoredEvidence === machineEvidence.length
  return {
    ...clone(input),
    schemaVersion: 6,
    normalizerVersion: 'after-sales-facts-v6-corrected',
    normalizedAt,
    publicationStatus: rawCorpusAvailable ? 'pending_admin_approval' : 'hold_raw_recrawl_required',
    normalizationBasis: {
      inputSchemaVersion: input.schemaVersion,
      mode: rawCorpusAvailable ? 'rebuild_from_raw_dom_and_pdf_anchors' : 'corrective_rebuild_from_normalized_evidence_projection',
      rawCorpusAvailable,
      rawAnchoredEvidence,
      unverifiedEvidence: machineEvidence.length - rawAnchoredEvidence,
      note: rawCorpusAvailable
        ? 'Machine evidence is anchored to recaptured raw DOM text or verified PDF page text. Dataset remains pending admin approval and is not published automatically.'
        : rawAnchoredEvidence
          ? `Only ${rawAnchoredEvidence} machine evidence item(s) retain a raw DOM/PDF anchor; the remaining ${machineEvidence.length - rawAnchoredEvidence} item(s) were reindexed against serialized excerpts and remain unverified until raw recapture.`
          : 'Machine evidence was reindexed against serialized excerpts; source offsets remain explicitly unverified until raw recapture.',
    },
    facts,
    summary: {
      candidateFacts,
      normalizedFacts,
      duplicateCandidatesMerged,
      usageAliasesMerged: sourceFacts.length - new Set(sourceFacts.map(fact => dedupeSignature({
        ...fact,
        usageCondition: fact.serviceType === 'warranty' && fact.usageCondition === 'general' ? 'standard_use' : fact.usageCondition,
        powertrain: normalizePowertrain(fact, modelPowertrains),
      }))).size,
      evidenceCount: facts.reduce((sum, fact) => sum + fact.provenances.length, 0),
      rawAnchoredEvidence,
      unverifiedEvidence: machineEvidence.length - rawAnchoredEvidence,
      factsNeedingReview: facts.filter(fact => fact.reviewStatus === 'pending_admin_review').length,
      curatedFacts: facts.filter(fact => fact.provenances.some(item => item.origin === 'manifest_transcription')).length,
      removedUngroundedFacts: REMOVED_FACT_IDS.size,
      correctedAt: normalizedAt,
    },
  }
}
