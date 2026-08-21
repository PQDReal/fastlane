import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildEvidenceContext } from './lib/after-sales-evidence-context.mjs'
import { decomposeSemanticClause, detectSubjectHint } from './lib/after-sales-semantic-clause.mjs'
import {
  inferBatteryChemistry,
  inferPolicySectionSubject,
  statementPrefixThroughValue,
  valueLocalRowPrefix,
} from './lib/after-sales-statement-scope.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const extractedPath = path.resolve(
  process.argv.find((argument) => argument.startsWith('--input='))?.slice('--input='.length) ||
    path.join(ROOT, 'public/data/after-sales-extracted.json'),
)
const manifestPath = path.join(ROOT, 'scripts/data/after-sales-source-manifest.json')
const outputPath = path.resolve(
  process.argv.find((argument) => argument.startsWith('--output='))?.slice('--output='.length) ||
    path.join(ROOT, 'public/data/after-sales-normalized.json'),
)

const input = JSON.parse(fs.readFileSync(extractedPath, 'utf8'))
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const sourceById = new Map((input.records || []).map((source) => [source.sourceId, source]))
const manifestSourceById = new Map((manifest.sources || []).map((source) => [source.id, source]))

const controlledFactTypes = new Set([
  'vehicle_warranty_duration',
  'vehicle_warranty_distance',
  'battery_warranty_duration',
  'battery_warranty_distance',
  'battery_12v_warranty_duration',
  'battery_12v_warranty_distance',
  'battery_capacity_threshold',
  'battery_post_repair_capacity_floor',
  'accessory_warranty_duration',
  'accessory_warranty_distance',
  'replacement_part_warranty_duration',
  'replacement_part_warranty_distance',
  'paint_warranty_duration',
  'paint_warranty_distance',
  'suspension_warranty_duration',
  'suspension_warranty_distance',
  'tire_warranty_duration',
  'tire_warranty_distance',
  'corrosion_warranty_duration',
  'corrosion_warranty_distance',
  'maintenance_interval_distance',
  'maintenance_interval_time',
  'roadside_assistance_duration',
  'roadside_assistance_distance',
  'service_response_time',
  'emergency_safety_wait_time',
  'appointment_arrival_window',
  'service_price',
  'coverage_percentage',
])

const numberUnitPattern =
  /(\d{1,3}(?:[.\s]\d{3})+|\d+(?:[.,]\d+)?)\s*(km|kilômét|kilomet(?:er)?s?|năm|years?|tháng|months?|ngày|days?|phút|minutes?|%|VNĐ|VND|đồng)(?=\s|[.,;:)\]}]|$)/giu
const lexicalIntervalPattern =
  /\b(?:(?:định\s+kỳ\s+)?(?:hàng|hằng)\s+(?:năm|tháng|ngày)|mỗi\s+(?:năm|tháng|ngày)(?:\s+một\s+lần)?)\b/giu
const warrantyContextPattern = /bảo hành|thời hạn|warranty|pin cao áp|ắc\s*[-–—]?\s*quy|phụ tùng|phụ kiện/iu
const maintenanceContextPattern =
  /bảo dưỡng|định kỳ|chu kỳ|mốc bảo dưỡng|lần đầu|sau\s+\d|mỗi\s+\d|(?:hàng|hằng)\s+(?:năm|tháng|ngày)|mỗi\s+(?:năm|tháng|ngày)/iu
const rescueContextPattern = /cứu hộ|hỗ trợ trên đường|eCall|khẩn cấp|phản hồi|điều phối|hiện trường/iu
const repairContextPattern = /sửa chữa|thời gian|cam kết|đồng sơn|bàn giao/iu
const priceContextPattern = /giá|mức phí|chi phí|phí dịch vụ|thanh toán|đơn giá|giá tiền/iu
const percentageContextPattern =
  /dung lượng|công suất|tỷ lệ|mức pin|hoàn tiền|khấu trừ|bồi hoàn|tối thiểu|không thấp hơn/iu
const batteryPostRepairCapacityPattern =
  /(?:sửa chữa|thay thế)[\s\S]{0,240}(?:phạm vi\s+bảo hành)[\s\S]{0,240}(?:đảm bảo\s+)?dung lượng\s+pin|(?:phạm vi\s+bảo hành)[\s\S]{0,240}(?:sửa chữa|thay thế)[\s\S]{0,240}(?:đảm bảo\s+)?dung lượng\s+pin/iu

function sha1(value, length = 20) {
  return crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, length)
}

const blockingSemanticFlags = new Set(['SOURCE_SCOPE_CONFLICT', 'ACTION_BINDING_AMBIGUOUS', 'UNRESOLVED_MODEL_ALIAS'])

function mergeAlternativeTriggers(...collections) {
  const triggers = collections
    .flatMap((collection) => (Array.isArray(collection) ? collection : []))
    .filter((trigger) => trigger?.type === 'event' && trigger?.code && trigger?.sourceText)
    .map((trigger) => ({
      type: 'event',
      code: String(trigger.code),
      sourceText: String(trigger.sourceText).replace(/\s+/gu, ' ').trim(),
    }))
    .sort((left, right) => left.code.localeCompare(right.code) || left.sourceText.localeCompare(right.sourceText, 'vi'))
  const byCode = new Map()
  for (const trigger of triggers) if (!byCode.has(trigger.code)) byCode.set(trigger.code, trigger)
  return [...byCode.values()]
}

function hasBlockingSemanticFlag(flags) {
  return (flags || []).some((flag) => blockingSemanticFlags.has(flag))
}

function reconcileAlternativeIntervalGroups(facts) {
  for (const fact of facts) {
    const parsedAlternatives = (fact.provenances || [])
      .map((provenance) => decomposeSemanticClause(provenance.excerpt || '', fact.valueText))
      .filter((parsed) => parsed.intervalRelation === 'or')
    if (parsedAlternatives.length) fact.intervalRelation = 'or'
    fact.alternativeTriggers = mergeAlternativeTriggers(
      fact.alternativeTriggers,
      ...parsedAlternatives.map((parsed) => parsed.nonNumericAlternativeTriggers),
    )
    if (fact.alternativeTriggers.length) {
      fact.intervalRelation = 'or'
      fact.semanticFlags = [...new Set([...(fact.semanticFlags || []), 'NON_NUMERIC_ALTERNATIVE_TRIGGER'])]
    }
  }

  const intervalFacts = facts.filter((candidate) => candidate.intervalRelation === 'or')
  const parents = intervalFacts.map((_, index) => index)
  const find = (index) => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]]
      index = parents[index]
    }
    return index
  }
  const union = (left, right) => {
    const leftRoot = find(left)
    const rightRoot = find(right)
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot
  }
  const ownerByKey = new Map()
  const componentKeys = intervalFacts.map((fact, index) => {
    const scope = [
      fact.serviceType,
      fact.vehicleType,
      fact.powertrain || 'all',
      fact.model || 'all_models',
      fact.subject,
      fact.batteryChemistry || 'not_applicable',
      fact.usageCondition,
      fact.applicability,
      fact.action,
    ].join('|')
    const evidenceKeys = (fact.provenances || []).map((provenance) =>
      [
        provenance.sourceId,
        provenance.assetHash || provenance.snapshotHash || '',
        provenance.pdfPage || '',
        cleanText(provenance.excerpt || ''),
      ].join('|'),
    )
    const keys = [`fact-group|${fact.factGroupId}`, ...evidenceKeys.map((key) => `evidence|${key}`)]
    for (const key of keys) {
      const scopedKey = `${scope}|${key}`
      if (ownerByKey.has(scopedKey)) union(index, ownerByKey.get(scopedKey))
      else ownerByKey.set(scopedKey, index)
    }
    return { scope, keys }
  })

  const components = new Map()
  for (let index = 0; index < intervalFacts.length; index += 1) {
    const root = find(index)
    if (!components.has(root)) components.set(root, [])
    components.get(root).push(index)
  }

  for (const memberIndexes of components.values()) {
    const members = memberIndexes.map((index) => intervalFacts[index])
    const seed = memberIndexes
      .flatMap((index) => componentKeys[index].keys.map((key) => `${componentKeys[index].scope}|${key}`))
      .sort()
      .join('|')
    const intervalGroupId = `af_interval_${sha1(`after-sales-interval-v5|${seed}`, 16)}`
    const distancePolicy = members.some((member) => member.unit === 'km')
      ? 'limited'
      : members.some((member) => member.distancePolicy === 'unlimited')
        ? 'unlimited'
        : 'not_stated'
    for (const member of members) {
      member.intervalGroupId = intervalGroupId
      member.intervalGroupDistancePolicy = distancePolicy
      if (member.unit !== 'km') member.distancePolicy = 'not_stated'
      else if (member.distancePolicy !== 'unlimited') member.distancePolicy = 'limited'
    }
  }
  return facts
}

function reapplySemanticSubsumption(facts) {
  const qualifierByCore = new Map()
  const unlimitedByCore = new Set()
  for (const fact of facts) {
    const core = semanticCoreKey(fact)
    if (fact.qualifier && !qualifierByCore.has(core)) qualifierByCore.set(core, fact.qualifier)
    if (fact.distancePolicy === 'unlimited') unlimitedByCore.add(core)
  }
  for (const fact of facts) {
    const core = semanticCoreKey(fact)
    if (!fact.qualifier && qualifierByCore.has(core)) fact.qualifier = qualifierByCore.get(core)
    if (fact.distancePolicy === 'not_stated' && unlimitedByCore.has(core)) fact.distancePolicy = 'unlimited'
  }
  return facts
}

function mergeReconciledFacts(facts) {
  const merged = new Map()
  const orderedFacts = [...facts].sort((left, right) => {
    const leftRank = left.unit === 'year' ? 0 : left.unit === 'month' ? 1 : 2
    const rightRank = right.unit === 'year' ? 0 : right.unit === 'month' ? 1 : 2
    return leftRank - rightRank
  })
  for (const fact of orderedFacts) {
    const equivalent =
      fact.unit === 'month' && fact.valueNumeric % 12 === 0
        ? { ...fact, valueNumeric: fact.valueNumeric / 12, unit: 'year' }
        : fact
    const key = canonicalKey(equivalent)
    const existing = merged.get(key)
    if (!existing) {
      fact.canonicalKey = canonicalKey(fact)
      merged.set(key, fact)
      continue
    }
    existing.sourceIds = [
      ...new Set([...(existing.sourceIds || [existing.sourceId]), ...(fact.sourceIds || [fact.sourceId])]),
    ].sort()
    const seen = new Set((existing.provenances || []).map(provenanceKey))
    for (const provenance of fact.provenances || []) {
      if (!seen.has(provenanceKey(provenance))) existing.provenances.push(provenance)
    }
    existing.provenances.sort((left, right) => provenanceKey(left).localeCompare(provenanceKey(right)))
    existing.confidence = Math.min(0.99, Math.max(existing.confidence, fact.confidence) + 0.02)
    existing.alternativeTriggers = mergeAlternativeTriggers(existing.alternativeTriggers, fact.alternativeTriggers)
    existing.semanticFlags = [...new Set([...(existing.semanticFlags || []), ...(fact.semanticFlags || [])])].sort()
    existing.groupSemanticFlags = [
      ...new Set([...(existing.groupSemanticFlags || []), ...(fact.groupSemanticFlags || [])]),
    ].sort()
    if (fact.intervalRelation === 'or') existing.intervalRelation = 'or'
    if (fact.reviewStatus === 'pending_admin_review') existing.reviewStatus = 'pending_admin_review'
    if (fact.reviewStatus === 'needs_review') existing.reviewStatus = 'needs_review'
  }
  return [...merged.values()]
}

function cleanText(value) {
  return String(value || '')
    .replace(/\u0000/g, ' ')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function parseNumber(raw) {
  const value = String(raw).trim().replace(/\s/g, '')
  if (/^\d{1,3}(?:\.\d{3})+$/.test(value)) return Number(value.replace(/\./g, ''))
  if (/^\d{1,3}(?:,\d{3})+$/.test(value)) return Number(value.replace(/,/g, ''))
  if (/^\d+,\d+$/.test(value)) return Number(value.replace(',', '.'))
  return Number(value)
}

function normalizeUnit(rawUnit) {
  const unit = String(rawUnit).toLocaleLowerCase('vi')
  if (unit === 'km' || unit.startsWith('kil')) return 'km'
  if (unit === 'năm' || unit.startsWith('year')) return 'year'
  if (unit === 'tháng' || unit.startsWith('month')) return 'month'
  if (unit === 'ngày' || unit.startsWith('day')) return 'day'
  if (unit === 'phút' || unit.startsWith('minute')) return 'minute'
  if (unit === '%') return 'percent'
  return 'VND'
}

function lexicalIntervalUnit(rawValue) {
  const value = String(rawValue || '').toLocaleLowerCase('vi')
  if (/năm|year/iu.test(value)) return 'year'
  if (/tháng|month/iu.test(value)) return 'month'
  if (/ngày|day/iu.test(value)) return 'day'
  return null
}

function normalizeModel(raw) {
  const value = String(raw).replace(/\s+/g, ' ').replace(/2,0/g, '2.0').trim()
  const compact = value.toLocaleLowerCase('vi').replace(/\s+/g, '')
  const mappings = [
    [/^vf8theallnew$/, 'VF 8 The All New'],
    [/^(?:lạchồng|lachong)900lx$/, 'Lạc Hồng 900LX'],
    [/^luxsa2\.0$/, 'Lux SA 2.0'],
    [/^luxa2\.0$/, 'Lux A 2.0'],
    [/^president$/, 'President'],
    [/^fadil$/, 'Fadil'],
    [/^(?:vf)?miniogreen$/, 'VF Minio Green'],
    [/^(?:vf)?neriogreen$/, 'VF Nerio Green'],
    [/^(?:vf)?heriogreen$/, 'VF Herio Green'],
    [/^(?:vf)?limogreen$/, 'VF Limo Green'],
    [/^vfecvan$/, 'VF EC Van'],
    [/^vfmpv7$/, 'VF MPV7'],
    [/^vfe34$/, 'VF e34'],
  ]
  for (const [pattern, canonical] of mappings) if (pattern.test(compact)) return canonical
  const vfNumber = compact.match(/^vf([3-9])$/)
  if (vfNumber) return `VF ${vfNumber[1]}`
  return value
}

function modelsFrom(text, url = '') {
  const haystack = `${text || ''} ${url || ''}`.replace(/[_\-/]+/g, ' ')
  const patterns = [
    /\bVF\s*8\s+The\s+All\s+New\b/giu,
    /\bL(?:ạc|ac)\s+H(?:ồng|ong)\s+900\s*LX\b/giu,
    /\bLux\s+SA\s*2[.,]0\b/giu,
    /\bLux\s+A\s*2[.,]0\b/giu,
    /\bPresident\b/giu,
    /\bFadil\b/giu,
    /\b(?:VF\s*)?(?:Minio|Nerio|Herio|Limo)\s+Green\b/giu,
    /\bVF\s*EC\s*Van\b/giu,
    /\bVF\s*MPV\s*7\b/giu,
    /\bVF\s*e34\b/giu,
    /\bVF\s*[3-9]\b/giu,
  ]

  let workingHaystack = haystack
  const models = new Set()

  for (const pattern of patterns) {
    const matches = [...workingHaystack.matchAll(pattern)]
    for (const match of matches) {
      models.add(normalizeModel(match[0]))
      const start = match.index
      const len = match[0].length
      workingHaystack = workingHaystack.slice(0, start) + ' '.repeat(len) + workingHaystack.slice(start + len)
    }
  }

  return [...models]
}

function legacyContextAround(text, index, matchLength) {
  const start = Math.max(0, index - 220)
  const end = Math.min(text.length, index + matchLength + 260)
  return cleanText(text.slice(start, end)).replace(/\n/g, ' | ')
}

function legacyStatementAround(text, index, matchLength, { lineBreaksAreBoundaries = true } = {}) {
  const isBoundary = (position) => {
    const char = text[position]
    if (/[!?;]/.test(char || '')) return true
    if (char === '\n') return lineBreaksAreBoundaries
    if (char !== '.') return false
    return !(/\d/.test(text[position - 1] || '') && /\d/.test(text[position + 1] || ''))
  }
  let start = index
  let end = index + matchLength
  while (start > 0 && index - start < 260 && !isBoundary(start - 1)) start -= 1
  while (end < text.length && end - index < 340 && !isBoundary(end)) end += 1
  const startMarker = '\uE000'
  const endMarker = '\uE001'
  const localMatchStart = index - start
  const marked = cleanText(
    [
      text.slice(start, index),
      startMarker,
      text.slice(index, index + matchLength),
      endMarker,
      text.slice(index + matchLength, end),
    ].join(''),
  )
  const markerStart = marked.indexOf(startMarker)
  const markerEnd = marked.indexOf(endMarker)
  if (markerStart < 0 || markerEnd < markerStart) {
    const statement = cleanText(text.slice(start, end))
    return {
      statement,
      matchStart: Math.min(localMatchStart, statement.length),
      matchEnd: Math.min(localMatchStart + matchLength, statement.length),
    }
  }
  const statement = `${marked.slice(0, markerStart)}${marked.slice(markerStart + 1, markerEnd)}${marked.slice(markerEnd + 1)}`
  return {
    statement,
    matchStart: markerStart,
    matchEnd: markerEnd - 1,
  }
}

const policySubjectPatterns = [
  ['accessory', /phụ kiện/iu],
  ['replacement_part', /phụ tùng thay thế|phụ tùng xe mới|phụ tùng chính hãng/iu],
  ['battery_12v', /ắc\s*[-–—]?\s*quy(?:\s*12\s*v)?|12\s*v\s*ắc\s*[-–—]?\s*quy/iu],
  ['battery', /pin cao áp|pin lithium|bộ pin|dung lượng pin|pin điện|\bpin\b/iu],
  ['paint', /sơn ngoại thất|bảo hành sơn/iu],
  ['corrosion', /gỉ sét|rỉ sét|ăn mòn|xuyên thủng/iu],
  ['suspension', /bộ phận treo|giảm xóc|hệ thống treo|thanh ổn định/iu],
  ['tire', /lốp xe|bảo hành lốp|\blốp\b/iu],
]

const policyHeadingPatterns = [
  ['accessory', /bảo hành phụ kiện/iu],
  ['replacement_part', /bảo hành\s+phụ tùng|phụ tùng\s+chính hãng/iu],
  ['battery_12v', /ắc\s*[-–—]?\s*quy(?:\s*12\s*v)?(?:\s*:|\s*(?=\n|$))/iu],
  [
    'battery',
    /pin(?:\s*\([^)]*\))?\s*:|pin\s*\(mua lần đầu[^)]*\)|(?:^|\n)\s*[•]?\s*pin cao áp[^\n]{0,100}(?=\n|$)/iu,
  ],
  ['paint', /sơn ngoại thất/iu],
  ['corrosion', /gỉ sét|rỉ sét|ăn mòn/iu],
  ['suspension', /các bộ phận treo|bộ phận treo/iu],
  ['tire', /bảo hành lốp|lốp xe\s*(?::|$)/iu],
  ['vehicle', /thời (?:hạn|gian) bảo hành (?:ô tô|xe|chung)|bảo hành xe mới/iu],
]

const maintenanceSubjectPatterns = [
  ['key_fob_battery', /pin\s+chìa khóa(?:\s+điều khiển)?/iu],
  ['tbox_battery', /pin\s+bộ\s+t-?box/iu],
  ['battery_coolant', /(?:nước|chất|dung dịch)\s+làm mát\s+pin/iu],
  ['air_conditioning_system', /hệ thống\s+(?:điều hòa|điều hoà)/iu],
  ['cabin_air_filter', /lọc gió điều hòa|bộ lọc không khí điều hòa/iu],
  ['engine_air_filter', /lọc gió động cơ|bộ lọc không khí/iu],
  ['engine_oil', /dầu động cơ|lọc dầu/iu],
  ['brake_fluid', /dầu phanh|chất lỏng phanh/iu],
  ['coolant', /dung dịch làm mát|nước làm mát/iu],
  ['brake_system', /má phanh|đĩa phanh|hệ thống phanh|tay phanh/iu],
  ['tire', /đảo lốp|áp suất lốp|\blốp\b/iu],
  ['battery_12v', /ắc\s*[-–—]?\s*quy/iu],
  ['battery', /pin cao áp|bộ pin|\bpin\b/iu],
  ['first_service', /lần đầu tiên|bảo dưỡng lần đầu/iu],
]

function lastMatchingSubject(text, patterns) {
  let selected = null
  let selectedIndex = -1
  for (const [subject, pattern] of patterns) {
    const globalPattern = new RegExp(pattern.source, 'giu')
    for (const match of String(text || '').matchAll(globalPattern)) {
      if (match.index >= selectedIndex) {
        selected = subject
        selectedIndex = match.index
      }
    }
  }
  return selected
}

function firstMatchingSubject(text, patterns) {
  for (const [subject, pattern] of patterns) if (pattern.test(String(text || ''))) return subject
  return null
}

function strongPolicySubject(statement) {
  const rules = [
    ['accessory', /phụ kiện.{0,220}(?:được bảo hành|thời hạn bảo hành)/iu],
    ['replacement_part', /phụ tùng.{0,260}(?:được bảo hành|thời hạn bảo hành|có thời hạn)/iu],
    ['battery_12v', /ắc\s*[-–—]?\s*quy.{0,180}(?:được bảo hành|thời hạn bảo hành|có thời hạn)/iu],
    ['battery', /(?:pin cao áp|\bpin\b).{0,220}(?:được bảo hành|thời hạn bảo hành|có thời hạn|dung lượng)/iu],
    ['paint', /sơn ngoại thất.{0,180}(?:được bảo hành|thời hạn bảo hành)/iu],
    ['corrosion', /(?:gỉ sét|rỉ sét|ăn mòn).{0,180}(?:được bảo hành|thời hạn bảo hành|bảo hành)/iu],
    ['suspension', /(?:bộ phận treo|giảm xóc|hệ thống treo).{0,220}(?:được bảo hành|thời hạn bảo hành)/iu],
    ['tire', /(?:lốp được trang bị|bảo hành lốp|lốp xe).{0,220}(?:được bảo hành|thời hạn bảo hành|có thời hạn)/iu],
  ]
  return firstMatchingSubject(statement, rules)
}

function subjectFrom(source, statement, precedingText, context) {
  if (source.serviceType === 'maintenance') {
    if (/bảo\s+dưỡng\s+xe\s+(?:ô\s+tô\s+)?(?:điện\s+)?vinfast\s+(?:nên|cần|được)/iu.test(`${statement} ${context}`)) {
      return 'vehicle'
    }
    const heading = String(precedingText || '')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line.length <= 140 && /:\s*$/.test(line))
      .at(-1)
    return (
      firstMatchingSubject(statement, maintenanceSubjectPatterns) ||
      firstMatchingSubject(heading, maintenanceSubjectPatterns) ||
      'vehicle'
    )
  }
  if (source.serviceType === 'rescue')
    return /ecall|sos|khẩn cấp/iu.test(context) ? 'emergency_response' : 'roadside_assistance'
  if (source.serviceType === 'repair') return 'repair_service'
  if (source.serviceType !== 'warranty') return 'vehicle'
  if (/\bpin\s+(?:lfp|khác\s*\(\s*không\s+phải\s+pin\s+lfp\s*\))\s*:/iu.test(statement)) return 'battery'
  if (/phụ\s+tùng[\s\S]{0,320}không\s+bao\s+gồm/iu.test(statement)) return 'replacement_part'
  if (/phụ\s+kiện[\s\S]{0,320}không\s+bao\s+gồm/iu.test(statement)) return 'accessory'
  const heading = inferPolicySectionSubject(precedingText) || lastMatchingSubject(precedingText, policyHeadingPatterns)
  const explicit = strongPolicySubject(statement)
  if (explicit) return explicit
  const localSubject = lastMatchingSubject(statement, policySubjectPatterns)
  if (localSubject) return localSubject
  if (
    /thời hạn bảo hành (?:chung|xe)|bảo hành (?:chung )?đối với mẫu xe|bảo hành ô tô|bảo hành xe mới/iu.test(statement)
  )
    return 'vehicle'
  if (heading) return heading
  return lastMatchingSubject(precedingText, policySubjectPatterns) || 'vehicle'
}

function usageConditionFrom(statement, precedingText, evidenceContext) {
  const flatten = (value) =>
    String(value || '')
      .replace(/\s*\|\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  statement = flatten(statement)
  precedingText = flatten(precedingText)
  evidenceContext = flatten(evidenceContext)
  const context = `${precedingText} ${statement}`
  const markers = []
  const addMarkers = (pattern, condition) => {
    for (const match of context.matchAll(pattern)) markers.push({ condition, position: match.index + match[0].length })
  }
  addMarkers(
    /bảo hành phụ kiện|bảo hành\s+phụ tùng|phụ tùng\s+chính hãng|ắc\s*[-–—]?\s*quy(?:\s*12\s*v)?(?:\s*:|\s+(?=ô tô))|pin(?:\s*\([^)]*\))?\s*:|pin cao áp|sơn ngoại thất|gỉ sét|rỉ sét|các bộ phận treo|bảo hành lốp|lốp xe|thời (?:hạn|gian) bảo hành (?:ô tô|xe mới|chung)|bảo hành xe mới/giu,
    'general',
  )
  addMarkers(/điều kiện sử dụng tiêu chuẩn|sử dụng trong điều kiện tiêu chuẩn|sử dụng tiêu chuẩn/giu, 'standard_use')
  addMarkers(/ngoại trừ trường hợp.{0,420}?(?:dịch vụ thương mại|taxi|kinh doanh)/giu, 'standard_use')
  addMarkers(/trong trường hợp.{0,420}?(?:dịch vụ thương mại|xe taxi|xe kinh doanh)/giu, 'commercial_use')
  addMarkers(
    /sử dụng (?:cho )?(?:mục đích )?dịch vụ thương mại|xe đang hoặc đã từng.{0,220}?dịch vụ thương mại/giu,
    'commercial_use',
  )
  return markers.sort((a, b) => b.position - a.position)[0]?.condition || 'general'
}

function applicabilityFrom(source, statement, precedingText, evidenceContext, subject) {
  if (source.serviceType !== 'warranty') return 'general'
  const context = `${precedingText.slice(-1800)} ${statement}`
  if (/mua lần đầu theo xe mới|được trang bị theo xe mới/iu.test(statement)) return 'original_equipment'
  if (/khách hàng mua.{0,300}(?:sau thời điểm giao xe|lắp đặt lên xe)/iu.test(statement))
    return 'customer_purchased_after_delivery'
  if (/khách hàng chịu chi phí/iu.test(statement)) return 'customer_paid_replacement'
  if (subject === 'replacement_part') return 'customer_paid_replacement'
  if (subject === 'battery_12v') {
    return /bảo hành phụ tùng/iu.test(context) ? 'customer_paid_replacement' : 'original_equipment'
  }
  if (
    subject === 'battery' &&
    /bảo hành\s+phụ\s+tùng|phụ\s+tùng\s+thay\s+thế.{0,500}khách\s+hàng\s+chịu\s+chi\s+phí/iu.test(context)
  ) {
    return 'customer_paid_replacement'
  }
  if (subject === 'battery' && /mua lần đầu theo xe mới|pin cao áp mua theo xe mới/iu.test(context))
    return 'original_equipment'
  if (subject === 'battery' && /khách hàng mua.{0,300}(?:sau thời điểm giao xe|lắp đặt lên xe)/iu.test(context))
    return 'customer_purchased_after_delivery'
  if (subject === 'accessory') {
    const flattenedEvidence = String(evidenceContext)
      .replace(/\s*\|\s*/g, ' ')
      .replace(/\s+/g, ' ')
    if (/không yêu cầu lắp đặt cố định/iu.test(flattenedEvidence)) return 'general_accessories_non_fixed'
    const excluded = [
      ...flattenedEvidence.matchAll(/không bao gồm.{0,220}?(?:móc kéo|bậc lên xuống|giá đỡ hành lý)/giu),
    ].at(-1)
    const included = [
      ...flattenedEvidence.matchAll(/các phụ kiện bao gồm.{0,260}?(?:móc kéo|bậc lên xuống|giá đỡ hành lý)/giu),
    ].at(-1)
    const excludedPosition = excluded ? excluded.index + excluded[0].length : -1
    const includedPosition = included ? included.index + included[0].length : -1
    if (excludedPosition >= 0 || includedPosition >= 0)
      return includedPosition > excludedPosition ? 'fixed_accessory_group' : 'general_accessories_excluding_fixed_group'
  }
  if (subject === 'tire' && /được trang bị theo xe|lốp dự phòng/iu.test(context)) return 'factory_fitted'
  if (['vehicle', 'paint', 'corrosion', 'suspension'].includes(subject)) return 'original_vehicle'
  return 'general'
}

function explicitVehicleTypeFrom(text) {
  const context = String(text || '').replace(/[_\-/]+/g, ' ')
  const motorbikeMatches = [...context.matchAll(/xe máy điện|xe máy|motorbike|scooter/giu)]
  const carMatches = [...context.matchAll(/ô tô|xe ô tô|xe xăng|xe điện|VF\s*(?:e34|[3-9])|Fadil|Lux|President/giu)]
  const motorbikeIndex = motorbikeMatches.at(-1)?.index ?? -1
  const carIndex = carMatches.at(-1)?.index ?? -1
  if (motorbikeIndex < 0 && carIndex < 0) return 'all'
  return motorbikeIndex > carIndex ? 'motorbike' : 'car'
}

function vehicleTypeFrom(source, statement, precedingText, models) {
  const explicit = explicitVehicleTypeFrom(statement)
  if (explicit !== 'all') return explicit
  if (source.vehicleType !== 'all') return source.vehicleType
  if (models.length) return 'car'
  return explicitVehicleTypeFrom(`${precedingText} ${statement}`)
}

function explicitPowertrainFrom(text) {
  const context = String(text || '').replace(/[_\-/]+/g, ' ')
  const electricMatches = [...context.matchAll(/ô\s*tô\s*điện|xe\s+máy\s+điện|xe\s+điện|động\s+cơ\s+điện|electric/giu)]
  const petrolMatches = [...context.matchAll(/ô\s*tô\s+xăng|xe\s+xăng|động\s+cơ\s+xăng|petrol|gasoline/giu)]
  const electricIndex = electricMatches.at(-1)?.index ?? -1
  const petrolIndex = petrolMatches.at(-1)?.index ?? -1
  if (electricIndex < 0 && petrolIndex < 0) return 'all'
  return electricIndex > petrolIndex ? 'electric' : 'petrol'
}

function powertrainFrom(source, statement, asset = null) {
  const explicit = explicitPowertrainFrom(`${statement} ${asset?.label || ''} ${asset?.url || ''}`)
  if (explicit !== 'all') return explicit
  return source.powertrain || 'all'
}

function distancePolicyFrom(statement, unit, clause = null, excerpt = '', evidenceContext = '') {
  const broadContext = `${clause?.clause || ''} ${statement || ''} ${excerpt || ''} ${evidenceContext || ''}`
  if (
    /không\s*giới\s*hạn[\s|]+(?:quãng\s*đường(?:\s*sử\s*dụng)?|số\s*km|km)|\bkhông\s*giới\s*hạn\s*km\b|\bunlimited\s*km\b/iu.test(
      broadContext,
    )
  ) {
    return 'unlimited'
  }
  if (unit === 'km' || /\d+(?:[.,\s]\d+)?\s*(?:km|kilômét|kilomet(?:er)?s?)/iu.test(clause?.clause || '')) {
    return 'limited'
  }
  return 'not_stated'
}

function intervalGroupDistancePolicyFrom(statement, intervalRelation, excerpt = '') {
  if (!intervalRelation) return null
  const context = `${statement || ''} ${excerpt || ''}`
  if (
    /không\s*giới\s*hạn[\s|]+(?:quãng\s*đường(?:\s*sử\s*dụng)?|số\s*km|km)|\bkhông\s*giới\s*hạn\s*km\b|\bunlimited\s*km\b/iu.test(
      context,
    )
  ) {
    return 'unlimited'
  }
  if (/\d+(?:[.,\s]\d+)?\s*(?:km|kilômét|kilomet(?:er)?s?)/iu.test(context)) return 'limited'
  return 'not_stated'
}

function actionFrom(source, statement, factType, actionHint = null, subject = null) {
  if (factType === 'battery_post_repair_capacity_floor') return 'post_repair_capacity_floor'
  if (factType === 'battery_capacity_threshold') return 'minimum_capacity'
  if (source.serviceType === 'warranty') return 'warranty_coverage'
  if (factType === 'service_price') return 'price'
  if (factType === 'emergency_safety_wait_time') return 'high_voltage_discharge_wait'
  if (factType === 'appointment_arrival_window') return 'appointment_arrival'
  if (source.serviceType === 'rescue') {
    if (/liên hệ lại/iu.test(statement)) return 'customer_callback'
    if (/chuyển tiếp yêu cầu/iu.test(statement)) return 'request_dispatch'
    if (/bắt đầu di chuyển/iu.test(statement)) return 'responder_departure'
    return 'service_response'
  }
  if (source.serviceType === 'maintenance') {
    if (subject === 'first_service' || /bảo dưỡng lần đầu|lần đầu tiên/iu.test(statement)) return 'first_service'
    if (actionHint) return actionHint
    if (/đảo lốp/iu.test(statement)) return 'rotate'
    if (/bôi trơn/iu.test(statement)) return 'lubricate'
    if (/thay mới|thay thế|thay dầu/iu.test(statement)) return 'replace'
    if (/kiểm tra/iu.test(statement)) return 'inspect'
    return 'scheduled_service'
  }
  return 'service_commitment'
}

function inferFactType(source, context, subject, unit) {
  const serviceType = source.serviceType
  if (unit === 'VND') return priceContextPattern.test(context) ? 'service_price' : null
  if (unit === 'percent') {
    if (!percentageContextPattern.test(context)) return null
    if (batteryPostRepairCapacityPattern.test(context)) return 'battery_post_repair_capacity_floor'
    return /pin|ắc\s*[-–—]?\s*quy|dung lượng/iu.test(context) ? 'battery_capacity_threshold' : 'coverage_percentage'
  }

  if (serviceType === 'warranty') {
    if (!warrantyContextPattern.test(context)) return null
    const dimension = unit === 'km' ? 'distance' : ['year', 'month', 'day'].includes(unit) ? 'duration' : null
    if (!dimension) return null
    if (subject === 'vehicle') return `vehicle_warranty_${dimension}`
    if (subject === 'battery') return `battery_warranty_${dimension}`
    if (subject === 'battery_12v') return `battery_12v_warranty_${dimension}`
    if (subject === 'accessory') return `accessory_warranty_${dimension}`
    if (subject === 'replacement_part') return `replacement_part_warranty_${dimension}`
    if (subject === 'paint') return `paint_warranty_${dimension}`
    if (subject === 'suspension') return `suspension_warranty_${dimension}`
    if (subject === 'tire') return `tire_warranty_${dimension}`
    if (subject === 'corrosion') return `corrosion_warranty_${dimension}`
  }

  if (serviceType === 'maintenance') {
    if (!maintenanceContextPattern.test(context)) return null
    if (unit === 'km') return 'maintenance_interval_distance'
    if (['year', 'month', 'day'].includes(unit)) return 'maintenance_interval_time'
  }

  if (serviceType === 'rescue') {
    if (!rescueContextPattern.test(context)) return null
    if (unit === 'minute' && /điện áp cao|vô hiệu hóa|ngắt nguồn điện|tiêu tan/iu.test(context))
      return 'emergency_safety_wait_time'
    if (unit === 'minute') return 'service_response_time'
    if (unit === 'km') return 'roadside_assistance_distance'
    if (['year', 'month', 'day'].includes(unit)) return 'roadside_assistance_duration'
  }

  if (serviceType === 'repair' && unit === 'minute' && repairContextPattern.test(context)) {
    return /đúng hẹn|đặt lịch|VPoint/iu.test(context) ? 'appointment_arrival_window' : 'service_response_time'
  }

  return null
}

function correctPostRepairCapacitySemantic(fact) {
  if (fact.factType !== 'battery_capacity_threshold') return fact
  const evidence = (fact.provenances || []).map((provenance) => provenance.excerpt || '').join(' ')
  if (!batteryPostRepairCapacityPattern.test(evidence)) return fact
  return {
    ...fact,
    factType: 'battery_post_repair_capacity_floor',
    action: 'post_repair_capacity_floor',
    usageCondition: 'general',
    qualifier: 'minimum',
  }
}

function qualifierFrom(context, factType, clause = null) {
  if (
    ['battery_capacity_threshold', 'battery_post_repair_capacity_floor'].includes(factType) &&
    /tối thiểu|không thấp hơn|trên/iu.test(context)
  )
    return 'minimum'
  if (clause?.actionConflict) return null
  if (clause?.qualifierHint) return clause.qualifierHint
  if (
    /(?:tùy|tuỳ)\s+điều kiện(?:\s+nào)?\s+đến\s+trước|điều kiện(?:\s+nào)?\s+đến\s+trước|whichever comes first/iu.test(
      context,
    )
  )
    return 'whichever_comes_first'
  if (/không quá|tối đa/iu.test(context)) return 'maximum'
  return null
}

function provenanceKey(provenance) {
  return [
    provenance.origin,
    provenance.sourceId,
    provenance.assetHash || provenance.snapshotHash || '',
    provenance.pdfPage || '',
    provenance.excerpt,
  ].join('|')
}

function candidateFromMatch({
  source,
  text,
  match,
  origin,
  asset = null,
  confidence,
  pdfPage = null,
  valueNumeric = null,
  unit = null,
  rawValue = null,
  evidenceText = text,
  evidenceIndex = match.index,
}) {
  const matchedValue = String(rawValue || match[0])
  valueNumeric = valueNumeric ?? parseNumber(match[1])
  unit = unit || normalizeUnit(match[2])
  if (!Number.isFinite(valueNumeric) || valueNumeric < 0) return []
  const evidenceWindow = buildEvidenceContext(evidenceText, evidenceIndex, matchedValue.length, {
    lineBreaksAreBoundaries: origin === 'snapshot_page_text',
    sourceOffsetsVerified:
      origin === 'snapshot_page_text'
        ? source.rawSnapshotVersion === 'after-sales-raw-v2' && Boolean(source.rawDomTextHash)
        : origin === 'asset_text_extraction'
          ? Boolean(asset?.verification?.typeVerified && asset?.verification?.contentHash && pdfPage)
          : false,
    sourceAnchor:
      origin === 'snapshot_page_text'
        ? {
            kind: 'raw_dom_text',
            snapshotVersion: source.rawSnapshotVersion || null,
            snapshotHash: source.contentHash || null,
            textHash: source.rawDomTextHash || null,
          }
        : origin === 'asset_text_extraction'
          ? {
              kind: 'pdf_page_text',
              assetHash: asset?.verification?.contentHash || asset?.contentHash || null,
              pdfPage,
            }
          : null,
  })
  const excerpt = evidenceWindow.excerpt
  const statementWindow = legacyStatementAround(text, match.index, matchedValue.length, {
    lineBreaksAreBoundaries: origin === 'snapshot_page_text',
  })
  const statement = statementWindow.statement
  const statementBounds = {
    matchStart: statementWindow.matchStart,
    matchEnd: statementWindow.matchEnd,
  }
  const statementMatchedValue = statement.slice(statementBounds.matchStart, statementBounds.matchEnd)
  const classificationStatement = statementPrefixThroughValue(statement, statementMatchedValue, statementBounds)
  const modelStatement = valueLocalRowPrefix(statement, statementMatchedValue, statementBounds)
  const classificationExcerpt = legacyContextAround(text, match.index, matchedValue.length)
  const evidenceContext = cleanText(
    text.slice(Math.max(0, match.index - 520), match.index + matchedValue.length),
  ).replace(/\n/g, ' | ')
  const precedingText = cleanText(text.slice(Math.max(0, match.index - 2400), match.index))
  const semanticStatement =
    origin === 'snapshot_page_text' && source.serviceType === 'warranty' ? modelStatement : statement
  const clause = decomposeSemanticClause(semanticStatement, statementMatchedValue)
  const localClauseSubject = detectSubjectHint(clause.clause)
  const isVehicleMaintenanceInterval =
    source.serviceType === 'maintenance' &&
    /bảo\s+dưỡng\s+xe\s+(?:ô\s+tô\s+)?(?:điện\s+)?vinfast\s+(?:nên|cần|được)/iu.test(
      `${classificationStatement} ${classificationExcerpt}`,
    )
  const subject = isVehicleMaintenanceInterval
    ? 'vehicle'
    : source.serviceType === 'maintenance' && localClauseSubject
      ? localClauseSubject
      : subjectFrom(source, classificationStatement, precedingText, evidenceContext)
  const factType = inferFactType(source, `${classificationExcerpt} ${evidenceContext}`, subject, unit)
  if (!factType || !controlledFactTypes.has(factType)) return []
  if (unit === 'percent' && valueNumeric > 100) return []

  // Detect models from statement AND asset metadata without collapsing
  const statementModels = modelsFrom(modelStatement)
  const assetModels = modelsFrom('', `${asset?.label || ''} ${asset?.url || ''}`)
  const detectedModels = statementModels.length ? statementModels : assetModels
  const models = detectedModels.length ? detectedModels : [null]
  const batteryChemistry =
    subject === 'battery' ? inferBatteryChemistry(classificationStatement, precedingText) : 'not_applicable'

  const vehicleType = vehicleTypeFrom(source, classificationStatement, precedingText, detectedModels)
  const explicitVehicleType = explicitVehicleTypeFrom(classificationStatement)
  const semanticFlags = [...clause.flags]
  const groupSemanticFlags = [...(clause.groupSemanticFlags || [])]
  if (source.vehicleType !== 'all' && explicitVehicleType !== 'all' && explicitVehicleType !== source.vehicleType) {
    semanticFlags.push('SOURCE_SCOPE_CONFLICT')
  }
  let usageCondition =
    source.serviceType === 'warranty'
      ? usageConditionFrom(classificationStatement, precedingText, evidenceContext)
      : 'general'
  const applicability = applicabilityFrom(source, classificationStatement, precedingText, evidenceContext, subject)
  if (applicability === 'general_accessories_non_fixed') usageCondition = 'general'
  const action = actionFrom(source, classificationStatement, factType, clause.actionHint, subject)

  // Seed factGroupId with occurrence physical location AND subject so it NEVER crosses subjects
  const groupSeed = [
    source.sourceId,
    origin,
    asset?.contentHash || source.contentHash || source.sourceUrl,
    pdfPage || '',
    evidenceWindow.index.sourceStart,
    evidenceWindow.index.sourceEnd,
    subject,
  ].join('|')
  const factGroupId = `af_group_${sha1(groupSeed, 16)}`

  // Seed intervalGroupId with exact semantic scope so it NEVER crosses applicability or subject
  const intervalGroupDistancePolicy = intervalGroupDistancePolicyFrom(statement, clause.intervalRelation, excerpt)
  const intervalGroupId = clause.intervalRelation
    ? `af_interval_${sha1([factGroupId, subject, batteryChemistry, applicability, usageCondition, action, models[0] || 'all_models', clause.intervalRelation].join('|'), 16)}`
    : null

  const extractionMethod = origin === 'snapshot_page_text' ? 'browser_inner_text' : asset?.extraction?.method || null
  const provenance = {
    origin,
    sourceId: source.sourceId,
    sourceUrl: source.sourceUrl,
    snapshotHash: source.contentHash || null,
    capturedAt: source.capturedAt || null,
    assetUrl: asset?.url || null,
    assetHash: asset?.contentHash || asset?.verification?.contentHash || null,
    pdfPage,
    extractionMethod,
    extractionConfidence: asset?.extraction?.confidence ?? null,
    sourceValueText: matchedValue.replace(/\s+/gu, ' ').trim(),
    excerpt,
    headingPath: evidenceWindow.headingPath || [],
    contextIndex: evidenceWindow.index,
  }

  const distancePolicy = distancePolicyFrom(statement, unit, clause, excerpt, evidenceContext)

  return models.map((model) => ({
    factGroupId,
    sourceId: source.sourceId,
    serviceType: source.serviceType,
    vehicleType,
    model,
    subject,
    policyEntity: subject,
    batteryChemistry,
    usageCondition,
    applicability,
    action,
    factType,
    valueNumeric,
    valueText: matchedValue.replace(/\s+/g, ' ').trim(),
    unit,
    qualifier: qualifierFrom(statement, factType, clause),
    intervalRelation: clause.intervalRelation,
    intervalGroupId,
    intervalGroupDistancePolicy,
    powertrain: powertrainFrom(source, statement, asset),
    distancePolicy,
    confidence,
    reviewStatus:
      hasBlockingSemanticFlag(semanticFlags) || origin === 'asset_ocr' || (factType.startsWith('vehicle_') && !model)
        ? 'needs_review'
        : 'pending',
    alternativeTriggers: mergeAlternativeTriggers(clause.nonNumericAlternativeTriggers),
    semanticFlags,
    groupSemanticFlags,
    provenances: [provenance],
  }))
}

function candidatesFromText({ source, text, origin, asset = null, confidence, pdfPage = null, focusMarker = null }) {
  const cleaned = cleanText(text)
  if (!cleaned) return []
  let focusOffset = 0
  let evidenceText = cleaned
  let evidenceOffset = 0
  if (focusMarker) {
    const markerIndex = cleaned.indexOf(focusMarker)
    if (markerIndex < 0) throw new Error(`Focus marker not found: ${focusMarker}`)
    focusOffset = markerIndex + focusMarker.length
    const pageStart = focusOffset + (cleaned[focusOffset] === '\n' ? 1 : 0)
    evidenceText = cleaned.slice(pageStart)
    evidenceOffset = pageStart
  }
  const analysisText = focusMarker ? cleaned.replace(focusMarker, ' '.repeat(focusMarker.length)) : cleaned
  const candidates = []
  const matches = [
    ...[...analysisText.matchAll(numberUnitPattern)].map((match) => ({
      match,
      valueNumeric: parseNumber(match[1]),
      unit: normalizeUnit(match[2]),
    })),
    ...[...analysisText.matchAll(lexicalIntervalPattern)].map((match) => ({
      match,
      valueNumeric: 1,
      unit: lexicalIntervalUnit(match[0]),
    })),
  ]
    .filter((item) => item.unit)
    .sort((a, b) => a.match.index - b.match.index)
  for (const item of matches) {
    if (focusMarker && item.match.index < focusOffset) continue
    candidates.push(
      ...candidateFromMatch({
        source,
        text: analysisText,
        match: item.match,
        origin,
        asset,
        confidence,
        pdfPage,
        valueNumeric: item.valueNumeric,
        unit: item.unit,
        rawValue: item.match[0],
        evidenceText,
        evidenceIndex: item.match.index - evidenceOffset,
      }),
    )
  }
  return candidates
}

function curatedCandidates() {
  const candidates = []
  for (const transcribed of manifest.transcribedFacts || []) {
    const source = sourceById.get(transcribed.sourceId)
    const manifestSource = manifestSourceById.get(transcribed.sourceId)
    if (!source || !manifestSource || transcribed.factType !== 'warranty-term') continue
    const text = cleanText(transcribed.standardUse)
    for (const match of text.matchAll(numberUnitPattern)) {
      const unit = normalizeUnit(match[2])
      const dimension = unit === 'km' ? 'distance' : ['year', 'month', 'day'].includes(unit) ? 'duration' : null
      if (!dimension) continue
      const factType = `vehicle_warranty_${dimension}`
      const valueNumeric = parseNumber(match[1])
      for (const rawModel of transcribed.vehicleModels || []) {
        const model = normalizeModel(rawModel)
        const excerpt = `${model}: ${text}`
        const factGroupId = `af_group_${sha1([source.sourceId, 'manifest_transcription', text, model].join('|'), 16)}`
        candidates.push({
          factGroupId,
          sourceId: source.sourceId,
          serviceType: source.serviceType,
          vehicleType: transcribed.vehicleType || source.vehicleType,
          powertrain: explicitPowertrainFrom(text),
          model,
          subject: 'vehicle',
          policyEntity: 'vehicle',
          batteryChemistry: 'not_applicable',
          usageCondition: 'standard_use',
          applicability: 'original_vehicle',
          action: 'warranty_coverage',
          factType,
          valueNumeric,
          valueText: String(match[0]).replace(/\s+/g, ' ').trim(),
          unit,
          qualifier:
            /(?:tùy|tuỳ)\s+điều kiện(?:\s+nào)?\s+đến\s+trước|điều kiện(?:\s+nào)?\s+đến\s+trước|whichever comes first/iu.test(
              text,
            )
              ? 'whichever_comes_first'
              : null,
          intervalRelation: null,
          intervalGroupId: null,
          intervalGroupDistancePolicy: null,
          distancePolicy: distancePolicyFrom(text, unit),
          alternativeTriggers: [],
          semanticFlags: [],
          groupSemanticFlags: [],
          confidence: 0.95,
          reviewStatus: transcribed.reviewStatus || 'pending_admin_review',
          provenances: [
            {
              origin: 'manifest_transcription',
              sourceId: source.sourceId,
              sourceUrl: transcribed.sourceUrl || source.sourceUrl,
              snapshotHash: source.contentHash || null,
              capturedAt: source.capturedAt || null,
              assetUrl: null,
              assetHash: null,
              pdfPage: null,
              extractionMethod: 'manual_transcription',
              extractionConfidence: null,
              sourceValueText: String(match[0]).replace(/\s+/gu, ' ').trim(),
              excerpt,
              headingPath: ['Chính sách bảo hành'],
            },
          ],
        })
      }
    }
  }
  return candidates
}

function canonicalKey(fact) {
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

function semanticCoreKey(fact) {
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
  ].join('|')
}

function usageAliasKey(fact) {
  return [
    fact.vehicleType || '',
    fact.powertrain || 'all',
    fact.model || 'all_models',
    fact.subject,
    fact.batteryChemistry || 'not_applicable',
    fact.applicability,
    fact.action,
    fact.factType,
    fact.valueNumeric,
    fact.unit,
    fact.distancePolicy || 'not_stated',
    fact.qualifier || '',
  ].join('|')
}

const rawCandidates = []
for (const source of input.records || []) {
  const configuredSource = manifestSourceById.get(source.sourceId)
  if (!configuredSource) continue
  const effectiveSource = {
    ...source,
    serviceType: configuredSource.serviceType || source.serviceType,
    vehicleType: configuredSource.vehicleType || source.vehicleType,
    scope: configuredSource.scope || source.scope,
  }
  if (!['after-sales-hub', 'service-center'].includes(effectiveSource.serviceType)) {
    rawCandidates.push(
      ...candidatesFromText({
        source: effectiveSource,
        text: source.text,
        origin: 'snapshot_page_text',
        confidence: 0.88,
      }),
    )
  }

  for (const asset of source.assets || []) {
    if (asset.verification?.duplicateOf) continue
    const text = asset.extraction?.text
    if (!text || asset.extraction?.status !== 'extracted') continue
    const isOcr = String(asset.extraction.method).startsWith('tesseract_ocr')
    const pages = !isOcr && Array.isArray(asset.extraction.pages) ? asset.extraction.pages : []
    if (pages.length) {
      for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
        const page = pages[pageIndex]
        const focusMarker = '[[AF_CURRENT_PDF_PAGE]]'
        const previousPageTail = String(pages[pageIndex - 1]?.text || '').slice(-2400)
        rawCandidates.push(
          ...candidatesFromText({
            source: effectiveSource,
            text: `${previousPageTail}\n${focusMarker}\n${page.text}`,
            origin: 'asset_text_extraction',
            asset,
            confidence: 0.82,
            pdfPage: page.pageNumber,
            focusMarker,
          }),
        )
      }
    } else {
      rawCandidates.push(
        ...candidatesFromText({
          source: effectiveSource,
          text,
          origin: isOcr ? 'asset_ocr' : 'asset_text_extraction',
          asset,
          confidence: isOcr ? 0.58 : 0.82,
        }),
      )
    }
  }
}
rawCandidates.push(...curatedCandidates())

const explicitStandardKeys = new Set(
  rawCandidates.filter((candidate) => candidate.usageCondition === 'standard_use').map(usageAliasKey),
)
let usageAliasesMerged = 0
for (const candidate of rawCandidates) {
  if (candidate.usageCondition !== 'general' || !explicitStandardKeys.has(usageAliasKey(candidate))) continue
  candidate.usageCondition = 'standard_use'
  usageAliasesMerged++
}

// Subsumption: merge under-specified candidates into richer explicit candidates
const explicitCores = new Map()
for (const candidate of rawCandidates) {
  const core = semanticCoreKey(candidate)
  const isExplicit = Boolean(candidate.qualifier || candidate.distancePolicy === 'unlimited')
  if (isExplicit) {
    if (!explicitCores.has(core)) explicitCores.set(core, [])
    explicitCores.get(core).push(candidate)
  }
}

for (const candidate of rawCandidates) {
  const core = semanticCoreKey(candidate)
  const explicits = explicitCores.get(core)
  if (explicits && explicits.length > 0) {
    const target = explicits[0]
    if (!candidate.qualifier && target.qualifier) candidate.qualifier = target.qualifier
    if (candidate.distancePolicy === 'not_stated' && target.distancePolicy === 'unlimited') {
      candidate.distancePolicy = 'unlimited'
    }
  }
}

const aggregated = new Map()
for (const candidate of rawCandidates) {
  const key = canonicalKey(candidate)
  const existing = aggregated.get(key)
  if (!existing) {
    aggregated.set(key, {
      ...candidate,
      canonicalKey: key,
      sourceIds: [candidate.sourceId],
      alternativeTriggers: mergeAlternativeTriggers(candidate.alternativeTriggers),
      semanticFlags: [...new Set(candidate.semanticFlags || [])],
      groupSemanticFlags: [...new Set(candidate.groupSemanticFlags || [])],
      provenances: [...candidate.provenances],
    })
    continue
  }
  existing.sourceIds = [...new Set([...existing.sourceIds, candidate.sourceId])]
  existing.sourceIds.sort((a, b) => a.localeCompare(b))
  if (String(candidate.sourceId).localeCompare(String(existing.sourceId)) < 0) {
    existing.sourceId = candidate.sourceId
  }
  if (String(candidate.valueText).localeCompare(String(existing.valueText)) < 0) {
    existing.valueText = candidate.valueText
  }
  const seen = new Set(existing.provenances.map(provenanceKey))
  for (const provenance of candidate.provenances) {
    if (!seen.has(provenanceKey(provenance))) existing.provenances.push(provenance)
  }
  existing.provenances.sort((a, b) => provenanceKey(a).localeCompare(provenanceKey(b)))
  existing.confidence = Math.min(0.99, Math.max(existing.confidence, candidate.confidence) + 0.02)
  existing.alternativeTriggers = mergeAlternativeTriggers(existing.alternativeTriggers, candidate.alternativeTriggers)
  existing.semanticFlags = [...new Set([...(existing.semanticFlags || []), ...(candidate.semanticFlags || [])])]
  existing.semanticFlags.sort()
  existing.groupSemanticFlags = [
    ...new Set([...(existing.groupSemanticFlags || []), ...(candidate.groupSemanticFlags || [])]),
  ]
  existing.groupSemanticFlags.sort()
  if (!existing.intervalRelation && candidate.intervalRelation) existing.intervalRelation = candidate.intervalRelation
  if (!existing.intervalGroupId && candidate.intervalGroupId) existing.intervalGroupId = candidate.intervalGroupId
  if (!existing.intervalGroupDistancePolicy && candidate.intervalGroupDistancePolicy) {
    existing.intervalGroupDistancePolicy = candidate.intervalGroupDistancePolicy
  }
  if (candidate.reviewStatus === 'pending_admin_review') existing.reviewStatus = 'pending_admin_review'
  if (candidate.reviewStatus === 'needs_review') existing.reviewStatus = 'needs_review'
}

let reconciledFacts = reapplySemanticSubsumption([...aggregated.values()].map(correctPostRepairCapacitySemantic))
reconciledFacts = reconcileAlternativeIntervalGroups(reconciledFacts)
reconciledFacts = reapplySemanticSubsumption(reconciledFacts)
reconciledFacts = mergeReconciledFacts(reconciledFacts)
reconciledFacts = reconcileAlternativeIntervalGroups(reconciledFacts)

const facts = reconciledFacts
  .map((fact) => {
    const origins = new Set(fact.provenances.map((item) => item.origin))
    const onlyOcr = origins.size === 1 && origins.has('asset_ocr')
    if (onlyOcr || (fact.factType.startsWith('vehicle_') && !fact.model) || hasBlockingSemanticFlag(fact.semanticFlags))
      fact.reviewStatus = 'needs_review'
    const resolvedCanonicalKey = canonicalKey(fact)
    const factId = `af_fact_${sha1(resolvedCanonicalKey, 20)}`
    return {
      factId,
      factGroupId: fact.factGroupId,
      canonicalKey: resolvedCanonicalKey,
      sourceId: fact.sourceId,
      sourceIds: fact.sourceIds,
      serviceType: fact.serviceType,
      vehicleType: fact.vehicleType,
      powertrain: fact.powertrain || 'all',
      model: fact.model,
      subject: fact.subject,
      batteryChemistry: fact.batteryChemistry || (fact.subject === 'battery' ? 'unspecified' : 'not_applicable'),
      policyEntity: fact.policyEntity,
      usageCondition: fact.usageCondition,
      applicability: fact.applicability,
      action: fact.action,
      factType: fact.factType,
      valueNumeric: fact.valueNumeric,
      valueText: fact.valueText,
      unit: fact.unit,
      qualifier: fact.qualifier,
      intervalRelation: fact.intervalRelation || null,
      intervalGroupId: fact.intervalGroupId || null,
      intervalGroupDistancePolicy: fact.intervalGroupDistancePolicy || null,
      distancePolicy: fact.distancePolicy || 'not_stated',
      confidence: Number(fact.confidence.toFixed(2)),
      reviewStatus: fact.reviewStatus,
      alternativeTriggers: mergeAlternativeTriggers(fact.alternativeTriggers),
      semanticFlags: [...new Set(fact.semanticFlags || [])],
      groupSemanticFlags: [...new Set(fact.groupSemanticFlags || [])],
      evidenceCount: fact.provenances.length,
      provenance: fact.provenances[0],
      provenances: fact.provenances,
    }
  })
  .sort((a, b) => a.canonicalKey.localeCompare(b.canonicalKey, 'vi'))

const evidenceCount = facts.reduce((sum, fact) => sum + fact.evidenceCount, 0)
const result = {
  schemaVersion: 5,
  normalizerVersion: 'after-sales-facts-v5',
  normalizedAt: new Date().toISOString(),
  controlledFactTypes: [...controlledFactTypes],
  summary: {
    candidateFacts: rawCandidates.length,
    normalizedFacts: facts.length,
    duplicateCandidatesMerged: rawCandidates.length - facts.length,
    usageAliasesMerged,
    evidenceCount,
    factsNeedingReview: facts.filter((fact) => fact.reviewStatus === 'needs_review').length,
    curatedFacts: facts.filter((fact) => fact.provenances.some((item) => item.origin === 'manifest_transcription'))
      .length,
  },
  facts,
}

fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify(result.summary, null, 2))
