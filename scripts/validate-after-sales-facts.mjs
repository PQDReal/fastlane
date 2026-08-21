import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectSemanticConflicts } from './lib/after-sales-persistence-audit.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const normalizedPath = path.join(ROOT, 'public/data/after-sales-normalized.json')
const extractedPath = path.join(ROOT, 'public/data/after-sales-extracted.json')
const manifestPath = path.join(ROOT, 'scripts/data/after-sales-source-manifest.json')
const reportPath = path.join(ROOT, '.local/after-sales/fact-validation-report.json')

const data = JSON.parse(fs.readFileSync(normalizedPath, 'utf8'))
const extracted = JSON.parse(fs.readFileSync(extractedPath, 'utf8'))
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

const allowedUnits = new Set(['year', 'month', 'day', 'minute', 'km', 'percent', 'VND'])
const allowedReviewStatuses = new Set(['pending', 'pending_admin_review', 'needs_review', 'approved', 'rejected'])
const allowedUsageConditions = new Set(['general', 'standard_use', 'commercial_use'])
const allowedApplicabilities = new Set([
  'general',
  'original_vehicle',
  'original_equipment',
  'customer_purchased_after_delivery',
  'customer_paid_replacement',
  'general_accessories_excluding_fixed_group',
  'general_accessories_non_fixed',
  'fixed_accessory_group',
  'factory_fitted',
])
const allowedPowertrains = new Set(['all', 'petrol', 'electric'])
const allowedBatteryChemistries = new Set(['not_applicable', 'unspecified', 'lfp', 'non_lfp'])
const allowedDistancePolicies = new Set(['not_stated', 'limited', 'unlimited'])
const allowedIntervalRelations = new Set(['or'])
const allowedFactSemanticFlags = new Set([
  'SOURCE_SCOPE_CONFLICT',
  'ACTION_BINDING_AMBIGUOUS',
  'NON_NUMERIC_ALTERNATIVE_TRIGGER',
  'UNRESOLVED_MODEL_ALIAS',
])
const allowedGroupSemanticFlags = new Set(['MULTI_ACTION_CLAUSE'])
const controlledFactTypes = new Set(data.controlledFactTypes || [])
const manifestSources = new Map((manifest.sources || []).map((source) => [source.id, source]))
const extractedSources = new Map((extracted.records || []).map((source) => [source.sourceId, source]))
const errors = []
const warnings = []
const semanticConflicts = []
const usageAliasConflicts = []
let brokenProvenances = 0

function isOfficialUrl(value) {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' && (url.hostname === 'vinfastauto.com' || url.hostname.endsWith('.vinfastauto.com'))
    )
  } catch {
    return false
  }
}

function provenanceIdentity(provenance) {
  return [
    provenance.origin,
    provenance.sourceId,
    provenance.assetHash || provenance.snapshotHash || '',
    provenance.pdfPage || '',
    provenance.excerpt || '',
  ].join('|')
}

function expectedCanonicalKey(fact) {
  return [
    fact.vehicleType || '',
    fact.powertrain || 'all',
    fact.model || 'all_models',
    fact.subject,
    fact.batteryChemistry || 'not_applicable',
    fact.usageCondition,
    fact.applicability,
    fact.action,
    fact.factType,
    fact.valueNumeric,
    fact.unit,
    fact.distancePolicy || 'not_stated',
    fact.qualifier || '',
  ].join('|')
}

function provenanceError(factId, message) {
  brokenProvenances += 1
  errors.push(`${factId}: ${message}`)
}

if (data.schemaVersion !== 5) errors.push(`unsupported schemaVersion ${data.schemaVersion}`)
if (data.normalizerVersion !== 'after-sales-facts-v5')
  warnings.push(`unexpected normalizerVersion ${data.normalizerVersion}`)
if (!Array.isArray(data.facts)) errors.push('facts must be an array')

const factIds = new Set()
const canonicalKeys = new Set()
const factGroupBySubject = new Map()
const intervalGroupByApplicability = new Map()

for (const fact of data.facts || []) {
  const factId = fact.factId || 'unknown'
  for (const key of [
    'factId',
    'factGroupId',
    'canonicalKey',
    'sourceId',
    'serviceType',
    'vehicleType',
    'powertrain',
    'subject',
    'batteryChemistry',
    'usageCondition',
    'applicability',
    'action',
    'factType',
    'unit',
    'distancePolicy',
    'reviewStatus',
  ]) {
    if (fact[key] === undefined || fact[key] === null || fact[key] === '') errors.push(`${factId}: missing ${key}`)
  }

  if (factIds.has(factId)) errors.push(`${factId}: duplicate factId`)
  factIds.add(factId)
  if (canonicalKeys.has(fact.canonicalKey)) errors.push(`${factId}: duplicate canonicalKey`)
  canonicalKeys.add(fact.canonicalKey)

  // Track group subjects and interval group scopes
  if (fact.factGroupId) {
    if (!factGroupBySubject.has(fact.factGroupId)) factGroupBySubject.set(fact.factGroupId, new Set())
    factGroupBySubject.get(fact.factGroupId).add(fact.subject)
  }
  if (fact.intervalGroupId) {
    if (!intervalGroupByApplicability.has(fact.intervalGroupId))
      intervalGroupByApplicability.set(fact.intervalGroupId, new Set())
    intervalGroupByApplicability.get(fact.intervalGroupId).add(`${fact.subject}|${fact.applicability}`)
  }

  if (fact.canonicalKey !== expectedCanonicalKey(fact))
    errors.push(`${factId}: canonicalKey does not match fact fields`)
  if (!controlledFactTypes.has(fact.factType)) errors.push(`${factId}: uncontrolled factType ${fact.factType}`)
  if (!allowedUnits.has(fact.unit)) errors.push(`${factId}: invalid unit ${fact.unit}`)
  if (!allowedPowertrains.has(fact.powertrain)) errors.push(`${factId}: invalid powertrain ${fact.powertrain}`)
  if (!allowedBatteryChemistries.has(fact.batteryChemistry))
    errors.push(`${factId}: invalid batteryChemistry ${fact.batteryChemistry}`)
  if (fact.subject === 'battery' && fact.batteryChemistry === 'not_applicable')
    errors.push(`${factId}: battery fact is missing chemistry scope`)
  if (fact.subject !== 'battery' && fact.batteryChemistry !== 'not_applicable')
    errors.push(`${factId}: non-battery fact has battery chemistry scope`)
  if (!allowedDistancePolicies.has(fact.distancePolicy))
    errors.push(`${factId}: invalid distancePolicy ${fact.distancePolicy}`)
  if (fact.intervalRelation !== null && !allowedIntervalRelations.has(fact.intervalRelation))
    errors.push(`${factId}: invalid intervalRelation ${fact.intervalRelation}`)
  if (fact.intervalRelation && !fact.intervalGroupId)
    errors.push(`${factId}: intervalRelation is missing intervalGroupId`)
  if (fact.intervalGroupId && !fact.intervalRelation)
    errors.push(`${factId}: intervalGroupId is missing intervalRelation`)
  if (fact.intervalGroupDistancePolicy !== null && !allowedDistancePolicies.has(fact.intervalGroupDistancePolicy))
    errors.push(`${factId}: invalid intervalGroupDistancePolicy ${fact.intervalGroupDistancePolicy}`)
  if (fact.intervalGroupId && !fact.intervalGroupDistancePolicy)
    errors.push(`${factId}: intervalGroupId is missing intervalGroupDistancePolicy`)
  if (!fact.intervalGroupId && fact.intervalGroupDistancePolicy !== null)
    errors.push(`${factId}: intervalGroupDistancePolicy is missing intervalGroupId`)
  if (!Array.isArray(fact.semanticFlags)) errors.push(`${factId}: semanticFlags must be an array`)
  for (const flag of fact.semanticFlags || [])
    if (!allowedFactSemanticFlags.has(flag)) errors.push(`${factId}: invalid fact semantic flag ${flag}`)
  if (!Array.isArray(fact.alternativeTriggers)) errors.push(`${factId}: alternativeTriggers must be an array`)
  const alternativeTriggerCodes = new Set()
  for (const [index, trigger] of (fact.alternativeTriggers || []).entries()) {
    if (trigger?.type !== 'event') errors.push(`${factId}: alternativeTriggers[${index}] must have type event`)
    if (!trigger?.code || typeof trigger.code !== 'string')
      errors.push(`${factId}: alternativeTriggers[${index}] is missing code`)
    if (!trigger?.sourceText || typeof trigger.sourceText !== 'string')
      errors.push(`${factId}: alternativeTriggers[${index}] is missing sourceText`)
    if (alternativeTriggerCodes.has(trigger?.code))
      errors.push(`${factId}: duplicate alternative trigger code ${trigger.code}`)
    alternativeTriggerCodes.add(trigger?.code)
  }
  const hasAlternativeTriggerFlag = (fact.semanticFlags || []).includes('NON_NUMERIC_ALTERNATIVE_TRIGGER')
  if (hasAlternativeTriggerFlag && !(fact.alternativeTriggers || []).length)
    errors.push(`${factId}: non-numeric alternative flag has no structured trigger`)
  if (!hasAlternativeTriggerFlag && (fact.alternativeTriggers || []).length)
    errors.push(`${factId}: structured alternative trigger is missing semantic flag`)
  if (!Array.isArray(fact.groupSemanticFlags)) errors.push(`${factId}: groupSemanticFlags must be an array`)
  for (const flag of fact.groupSemanticFlags || [])
    if (!allowedGroupSemanticFlags.has(flag)) errors.push(`${factId}: invalid group semantic flag ${flag}`)
  if (!allowedReviewStatuses.has(fact.reviewStatus)) errors.push(`${factId}: invalid reviewStatus ${fact.reviewStatus}`)
  if (!allowedUsageConditions.has(fact.usageCondition))
    errors.push(`${factId}: invalid usageCondition ${fact.usageCondition}`)
  if (!allowedApplicabilities.has(fact.applicability))
    errors.push(`${factId}: invalid applicability ${fact.applicability}`)
  if (fact.policyEntity !== fact.subject)
    errors.push(`${factId}: policyEntity compatibility alias differs from subject`)
  if (!Number.isFinite(fact.valueNumeric) || fact.valueNumeric <= 0) errors.push(`${factId}: invalid numeric value`)
  if (!Number.isFinite(fact.confidence) || fact.confidence < 0 || fact.confidence > 1)
    errors.push(`${factId}: invalid confidence`)

  if (fact.factType.endsWith('_duration') && !['year', 'month', 'day'].includes(fact.unit)) {
    errors.push(`${factId}: duration/unit mismatch`)
  }
  if (fact.factType.endsWith('_distance') && fact.unit !== 'km') {
    errors.push(`${factId}: distance/unit mismatch`)
  }
  if (fact.factType === 'maintenance_interval_time' && !['year', 'month', 'day'].includes(fact.unit)) {
    errors.push(`${factId}: maintenance time/unit mismatch`)
  }
  if (fact.factType === 'service_response_time' && fact.unit !== 'minute') {
    errors.push(`${factId}: response time/unit mismatch`)
  }
  if (['emergency_safety_wait_time', 'appointment_arrival_window'].includes(fact.factType) && fact.unit !== 'minute') {
    errors.push(`${factId}: minute-based fact/unit mismatch`)
  }
  if (
    ['battery_capacity_threshold', 'battery_post_repair_capacity_floor', 'coverage_percentage'].includes(
      fact.factType,
    ) &&
    fact.unit !== 'percent'
  ) {
    errors.push(`${factId}: percentage/unit mismatch`)
  }
  if (fact.unit === 'percent' && fact.valueNumeric > 100) errors.push(`${factId}: percentage exceeds 100`)
  if (fact.factType === 'service_price' && fact.unit !== 'VND') errors.push(`${factId}: service price/unit mismatch`)
  if (fact.unit === 'VND' && fact.factType !== 'service_price')
    errors.push(`${factId}: currency used by non-price fact`)
  if (fact.serviceType !== 'warranty' && fact.usageCondition !== 'general')
    errors.push(`${factId}: non-warranty fact has warranty usage condition`)
  if (fact.serviceType !== 'warranty' && fact.applicability !== 'general')
    errors.push(`${factId}: non-warranty fact has warranty applicability`)
  const warrantySubjects = {
    vehicle_warranty: 'vehicle',
    battery_warranty: 'battery',
    battery_12v_warranty: 'battery_12v',
    accessory_warranty: 'accessory',
    replacement_part_warranty: 'replacement_part',
    paint_warranty: 'paint',
    suspension_warranty: 'suspension',
    tire_warranty: 'tire',
    corrosion_warranty: 'corrosion',
  }
  for (const [prefix, expectedSubject] of Object.entries(warrantySubjects)) {
    if (fact.factType.startsWith(prefix) && fact.subject !== expectedSubject)
      errors.push(`${factId}: ${fact.factType} requires subject ${expectedSubject}`)
  }
  if (
    ['battery_capacity_threshold', 'battery_post_repair_capacity_floor'].includes(fact.factType) &&
    fact.subject !== 'battery'
  )
    errors.push(`${factId}: battery capacity fact requires battery subject`)

  if (fact.unit === 'year' && fact.valueNumeric > 30)
    warnings.push(`${factId}: unusually large year value ${fact.valueNumeric}`)
  if (fact.unit === 'month' && fact.valueNumeric > 240)
    warnings.push(`${factId}: unusually large month value ${fact.valueNumeric}`)
  if (fact.unit === 'day' && fact.valueNumeric > 3650)
    warnings.push(`${factId}: unusually large day value ${fact.valueNumeric}`)
  if (fact.unit === 'minute' && fact.valueNumeric > 10080)
    warnings.push(`${factId}: unusually large minute value ${fact.valueNumeric}`)
  if (fact.unit === 'km' && fact.valueNumeric > 2_000_000)
    warnings.push(`${factId}: unusually large distance ${fact.valueNumeric}`)
  if (fact.unit === 'VND' && fact.valueNumeric > 100_000_000_000)
    warnings.push(`${factId}: unusually large price ${fact.valueNumeric}`)

  if (!manifestSources.has(fact.sourceId)) errors.push(`${factId}: sourceId not found in manifest`)
  if (!Array.isArray(fact.sourceIds) || fact.sourceIds.length === 0)
    errors.push(`${factId}: sourceIds must be non-empty`)
  for (const sourceId of fact.sourceIds || []) {
    if (!manifestSources.has(sourceId)) errors.push(`${factId}: sourceIds contains unknown source ${sourceId}`)
  }

  if (!Array.isArray(fact.provenances) || fact.provenances.length === 0) {
    provenanceError(factId, 'missing provenance chain')
    continue
  }
  if (fact.evidenceCount !== fact.provenances.length) errors.push(`${factId}: evidenceCount does not match provenances`)
  if (JSON.stringify(fact.provenance) !== JSON.stringify(fact.provenances[0]))
    errors.push(`${factId}: legacy provenance is not the first provenance`)

  const provenanceKeys = new Set()
  for (const provenance of fact.provenances) {
    const identity = provenanceIdentity(provenance)
    if (provenanceKeys.has(identity)) provenanceError(factId, 'duplicate provenance evidence')
    provenanceKeys.add(identity)

    const allowedOrigins = new Set([
      'snapshot_page_text',
      'asset_text_extraction',
      'asset_ocr',
      'manifest_transcription',
    ])
    if (!allowedOrigins.has(provenance.origin))
      provenanceError(factId, `invalid provenance origin ${provenance.origin}`)
    if (!manifestSources.has(provenance.sourceId))
      provenanceError(factId, `provenance sourceId not found: ${provenance.sourceId}`)
    if (!isOfficialUrl(provenance.sourceUrl)) provenanceError(factId, 'provenance source URL is not official')
    if (!provenance.sourceValueText || typeof provenance.sourceValueText !== 'string')
      provenanceError(factId, 'provenance sourceValueText is empty')
    if (!provenance.excerpt) provenanceError(factId, 'provenance excerpt is empty')
    if (provenance.origin !== 'manifest_transcription') {
      const index = provenance.contextIndex
      if (!index || !['after-sales-evidence-context-v1', 'after-sales-evidence-context-v2'].includes(index.version)) {
        provenanceError(factId, 'extracted provenance is missing context index')
      } else if (
        !Number.isInteger(index.sourceStart) ||
        !Number.isInteger(index.sourceEnd) ||
        !Number.isInteger(index.excerptStart) ||
        !Number.isInteger(index.excerptEnd) ||
        !Number.isInteger(index.matchStart) ||
        !Number.isInteger(index.matchEnd) ||
        index.sourceStart > index.matchStart ||
        index.matchStart >= index.matchEnd ||
        index.matchEnd > index.sourceEnd ||
        index.sourceStart > index.excerptStart ||
        index.excerptStart > index.excerptEnd ||
        index.excerptEnd > index.sourceEnd ||
        index.crossedFutureBoundary !== false
      ) {
        provenanceError(factId, 'invalid or unsafe evidence context index')
      }
    }

    const source = extractedSources.get(provenance.sourceId)
    if (!source) {
      provenanceError(factId, `provenance source missing from extracted snapshot: ${provenance.sourceId}`)
      continue
    }
    if (provenance.snapshotHash && provenance.snapshotHash !== source.contentHash) {
      provenanceError(factId, 'provenance snapshot hash does not match extracted source')
    }

    if (['asset_text_extraction', 'asset_ocr'].includes(provenance.origin)) {
      if (!provenance.assetUrl || !provenance.assetHash) {
        provenanceError(factId, 'asset provenance is missing URL or hash')
        continue
      }
      const matchingAsset = (source.assets || []).find(
        (asset) =>
          asset.url === provenance.assetUrl &&
          (asset.contentHash === provenance.assetHash || asset.verification?.contentHash === provenance.assetHash),
      )
      if (!matchingAsset) provenanceError(factId, 'asset provenance does not resolve to extracted asset')
      if (!provenance.extractionMethod) provenanceError(factId, 'asset provenance is missing extraction method')
      if (provenance.extractionMethod === 'pdf_text_layer') {
        if (!Number.isInteger(provenance.pdfPage) || provenance.pdfPage < 1) {
          provenanceError(factId, 'PDF provenance is missing a valid page number')
        } else if (!matchingAsset?.extraction?.pages?.some((page) => page.pageNumber === provenance.pdfPage)) {
          provenanceError(factId, `PDF provenance page ${provenance.pdfPage} does not resolve to extracted page text`)
        }
      } else if (provenance.pdfPage !== null && provenance.pdfPage !== undefined) {
        provenanceError(factId, `${provenance.extractionMethod} provenance must not claim a PDF page`)
      }
    } else if (provenance.assetUrl || provenance.assetHash) {
      provenanceError(factId, `${provenance.origin} must not claim an asset`)
    } else if (provenance.pdfPage !== null && provenance.pdfPage !== undefined) {
      provenanceError(factId, `${provenance.origin} must not claim a PDF page`)
    }
  }

  const provenanceSourceIds = new Set(fact.provenances.map((item) => item.sourceId))
  for (const sourceId of fact.sourceIds || []) {
    if (!provenanceSourceIds.has(sourceId)) errors.push(`${factId}: sourceIds entry has no provenance: ${sourceId}`)
  }

  if (fact.reviewStatus === 'needs_review') warnings.push(`${factId}: requires semantic review`)
  if (fact.confidence < 0.7) warnings.push(`${factId}: low confidence ${fact.confidence}`)
  if (fact.factType.startsWith('vehicle_warranty_') && !fact.model)
    warnings.push(`${factId}: vehicle warranty has no model`)
  if (fact.provenances.every((item) => item.origin === 'asset_ocr'))
    warnings.push(`${factId}: fact is supported only by OCR`)
}

// Enforce FACT_GROUP_CROSS_SUBJECT = 0
for (const [groupId, subjects] of factGroupBySubject) {
  if (subjects.size > 1) {
    errors.push(`FACT_GROUP_CROSS_SUBJECT: group ${groupId} contains multiple subjects: ${[...subjects].join(', ')}`)
  }
}

// Enforce INTERVAL_GROUP_CROSS_APPLICABILITY = 0
for (const [intervalId, scopes] of intervalGroupByApplicability) {
  if (scopes.size > 1) {
    errors.push(
      `INTERVAL_GROUP_CROSS_APPLICABILITY: interval group ${intervalId} contains multiple scopes: ${[...scopes].join(', ')}`,
    )
  }
}

for (const finding of detectSemanticConflicts(data.facts || [])) {
  semanticConflicts.push(finding)
  warnings.push(`${finding.type} ${finding.scopeKey}: ${finding.values.join(', ')}`)
}

const usageAliasGroups = new Map()
for (const fact of (data.facts || []).filter((item) => item.serviceType === 'warranty')) {
  const key = [
    fact.vehicleType,
    fact.powertrain,
    fact.model || 'all_models',
    fact.subject,
    fact.applicability,
    fact.action,
    fact.factType,
    fact.valueNumeric,
    fact.unit,
    fact.distancePolicy,
    fact.qualifier || '',
  ].join('|')
  if (!usageAliasGroups.has(key)) usageAliasGroups.set(key, [])
  usageAliasGroups.get(key).push(fact)
}
for (const [key, facts] of usageAliasGroups) {
  const usages = new Set(facts.map((fact) => fact.usageCondition))
  if (!usages.has('general') || !usages.has('standard_use')) continue
  usageAliasConflicts.push({ key, factIds: facts.map((fact) => fact.factId) })
  warnings.push(`unreconciled general/standard usage alias ${key}`)
}

const output = {
  validatorVersion: 'after-sales-facts-validator-v2',
  validatedAt: new Date().toISOString(),
  summary: {
    facts: data.facts?.length || 0,
    evidence: (data.facts || []).reduce((sum, fact) => sum + (fact.provenances?.length || 0), 0),
    errors: errors.length,
    warnings: warnings.length,
    brokenProvenances,
    semanticConflicts: semanticConflicts.length,
    semanticConflictTypes: semanticConflicts.reduce((counts, finding) => {
      counts[finding.type] = (counts[finding.type] || 0) + 1
      return counts
    }, {}),
    usageAliasConflicts: usageAliasConflicts.length,
  },
  errors,
  warnings,
  semanticConflicts,
  usageAliasConflicts,
  decision: errors.length ? 'REJECT' : warnings.length ? 'REVIEW' : 'PASS',
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true })
fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({ ...output.summary, decision: output.decision }, null, 2))
if (errors.length) process.exitCode = 1
