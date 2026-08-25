import 'server-only'

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type {
  EvidenceRecord,
  FindServiceLocationsInput,
  SearchAfterSalesInput,
  ToolObservationRef,
  ToolResult,
} from '../contracts'

type PublishedReleaseRow = {
  release_id: string
  published_at: string
}

export type PublishedAfterSalesFactRow = {
  fact_id: string
  fact_group_id: string
  release_id: string
  service_type: 'warranty' | 'maintenance' | 'repair' | 'rescue'
  vehicle_type: 'car' | 'motorbike' | 'bus'
  powertrain: string | null
  model: string | null
  subject: string
  policy_entity: string | null
  battery_chemistry: string | null
  usage_condition: string | null
  applicability: string | null
  action: string | null
  fact_type: string
  value_numeric: number | string | null
  value_text: string | null
  unit: string | null
  qualifier: string | null
  interval_relation: string | null
  interval_group_id: string | null
  interval_group_distance_policy: string | null
  distance_policy: string | null
  updated_at: string | null
  evidence?: unknown
}

type FactSource = {
  sourceUrl: string
  assetUrl?: string
  pdfPage?: number
  excerpt?: string
  capturedAt?: string
}

export type PublishedServiceLocationRow = {
  location_id: string
  release_id: string
  name: string
  location_category: 'official_car_workshop' | 'partner_car_workshop' | 'electric_motorbike_workshop'
  category_label: string | null
  vehicle_types: string[] | null
  service_types: string[] | null
  bookable_service_types: string[] | null
  capability_granularity: string
  address: Record<string, unknown> | null
  contact: Record<string, unknown> | null
  service_hours: Record<string, unknown> | null
  operational_status: string
  evidence: Record<string, unknown> | null
  updated_at: string | null
}

const FACT_INDEX_COLUMNS = [
  'fact_id',
  'fact_group_id',
  'release_id',
  'service_type',
  'vehicle_type',
  'powertrain',
  'model',
  'subject',
  'policy_entity',
  'battery_chemistry',
  'usage_condition',
  'applicability',
  'action',
  'fact_type',
  'value_numeric',
  'value_text',
  'unit',
  'qualifier',
  'interval_relation',
  'interval_group_id',
  'interval_group_distance_policy',
  'distance_policy',
  'updated_at',
].join(',')

const FACT_DETAIL_COLUMNS = `${FACT_INDEX_COLUMNS},evidence`

const LOCATION_COLUMNS = [
  'location_id',
  'release_id',
  'name',
  'location_category',
  'category_label',
  'vehicle_types',
  'service_types',
  'bookable_service_types',
  'capability_granularity',
  'address',
  'contact',
  'service_hours',
  'operational_status',
  'evidence',
  'updated_at',
].join(',')

const SUBJECT_LABELS: Record<string, string> = {
  accessory: 'phụ kiện',
  air_conditioning_system: 'hệ thống điều hòa',
  battery: 'pin cao áp',
  battery_12v: 'ắc quy 12V',
  battery_coolant: 'nước làm mát pin',
  brake_fluid: 'dầu phanh',
  brake_system: 'hệ thống phanh',
  cabin_air_filter: 'lọc gió điều hòa',
  corrosion: 'chống ăn mòn',
  emergency_response: 'phản ứng khẩn cấp',
  engine_air_filter: 'lọc gió động cơ',
  engine_oil: 'dầu động cơ',
  first_service: 'bảo dưỡng đầu tiên',
  key_fob_battery: 'pin chìa khóa',
  paint: 'sơn xe',
  repair_service: 'dịch vụ sửa chữa',
  replacement_part: 'phụ tùng thay thế',
  roadside_assistance: 'cứu hộ bên đường',
  seat_lock_and_stands: 'khóa yên và chân chống',
  steering_head_bearing: 'vòng bi cổ lái',
  suspension: 'hệ thống treo',
  tbox_battery: 'pin T-Box',
  tire: 'lốp xe',
  vehicle: 'toàn bộ xe',
}

const ACTION_LABELS: Record<string, string> = {
  appointment_arrival: 'Khoảng tiếp nhận lịch hẹn',
  customer_callback: 'Gọi lại khách hàng',
  first_service: 'Bảo dưỡng đầu tiên',
  high_voltage_discharge_wait: 'Thời gian chờ tiêu tán điện áp cao',
  inspect: 'Kiểm tra',
  lubricate: 'Bôi trơn',
  replace: 'Thay thế',
  request_dispatch: 'Chuyển yêu cầu đến điều phối',
  responder_departure: 'Đơn vị cứu hộ xuất phát',
  rotate: 'Đảo',
  scheduled_service: 'Bảo dưỡng định kỳ',
  warranty_coverage: 'Bảo hành',
}

const USAGE_LABELS: Record<string, string> = {
  commercial_use: 'sử dụng thương mại',
  general: 'điều kiện chung',
  standard_use: 'sử dụng tiêu chuẩn',
}

const APPLICABILITY_LABELS: Record<string, string> = {
  customer_paid_replacement: 'hạng mục khách hàng mua thay thế',
  customer_purchased_after_delivery: 'pin mua sau khi bàn giao xe',
  factory_fitted: 'trang bị từ nhà máy',
  fixed_accessory_group: 'nhóm phụ kiện cố định',
  general: 'phạm vi chung',
  general_accessories_excluding_fixed_group: 'phụ kiện chung không thuộc nhóm cố định',
  general_accessories_non_fixed: 'phụ kiện không cố định',
  original_equipment: 'trang bị nguyên bản',
  original_vehicle: 'xe nguyên bản',
}

function normalize(value: unknown): string {
  return typeof value === 'string'
    ? value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
    : ''
}

function normalizeModel(value: unknown): string {
  return normalize(value)
    .replace(/^vinfast\s+/, '')
    .replace(/\b(?:doi|model|nam)\s+20\d{2}\b/g, '')
    .replace(/\b20\d{2}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function inferPowertrain(model?: string): 'electric' | 'petrol' | undefined {
  const normalized = normalizeModel(model)
  if (!normalized) return undefined
  if (/\b(?:fadil|lux|president)\b/.test(normalized)) return 'petrol'
  if (/\b(?:vf|ec van|green|lac hong)\b/.test(normalized)) return 'electric'
  return undefined
}

function inferTargets(query: string, serviceType: SearchAfterSalesInput['serviceType']): string[] {
  const text = normalize(query)
  const targets = new Set<string>()

  if (/\b(?:ac quy|12v)\b/.test(text)) targets.add('battery_12v')
  if (/\b(?:pin|battery)\b/.test(text) && !targets.has('battery_12v')) targets.add('battery')
  if (/\b(?:lop|tire)\b/.test(text)) targets.add('tire')
  if (/\b(?:phu tung|linh kien thay the)\b/.test(text)) targets.add('replacement_part')
  if (/\bphu kien\b/.test(text)) targets.add('accessory')
  if (/\b(?:son xe|lop son)\b/.test(text)) targets.add('paint')
  if (/\b(?:an mon|ri set)\b/.test(text)) targets.add('corrosion')
  if (/\b(?:he thong treo|giam xoc)\b/.test(text)) targets.add('suspension')

  if (serviceType === 'warranty') {
    if (/\b(?:bao hanh xe|xe va pin|toan bo xe|than xe)\b/.test(text) || targets.size === 0) {
      targets.add('vehicle')
    }
  }

  if (serviceType === 'maintenance') {
    if (/\bdau phanh\b/.test(text)) {
      targets.add('brake_fluid')
    } else if (/\bphanh\b/.test(text)) {
      targets.add('brake_fluid')
      targets.add('brake_system')
    }
    if (/\b(?:bao duong dau tien|lan dau)\b/.test(text)) {
      targets.add('first_service')
    } else if (/\b(?:bao duong|dinh ky|bao lau|bao nhieu km|hang nam|lich)\b/.test(text) && targets.size === 0) {
      targets.add('vehicle')
      targets.add('scheduled_service')
    }
  }

  if (serviceType === 'repair') {
    targets.add('repair_service')
    if (/\b(?:hen|gio hen|den som|den muon|tiep nhan)\b/.test(text)) {
      targets.add('appointment_arrival')
      targets.add('appointment_arrival_window')
    }
  }

  if (serviceType === 'rescue') {
    if (/\b(?:phan hoi|dieu phoi|goi lai|xuat phat|bao lau|thoi gian)\b/.test(text)) {
      targets.add('service_response_time')
      targets.add('request_dispatch')
      targets.add('customer_callback')
      targets.add('responder_departure')
    } else {
      targets.add('emergency_response')
      targets.add('roadside_assistance')
    }
  }

  return [...targets]
}

function rowMatchesTarget(row: PublishedAfterSalesFactRow, target: string): boolean {
  return [row.subject, row.policy_entity, row.action, row.fact_type].includes(target)
}

function rowScore(
  row: PublishedAfterSalesFactRow,
  input: SearchAfterSalesInput,
  targets: string[],
): number {
  let score = 0
  const requestedModel = normalizeModel(input.model)
  const rowModel = normalizeModel(row.model)
  const query = normalize(input.query)
  const isCommercialQuery = /\b(?:thuong mai|kinh doanh|taxi|dich vu)\b/.test(query)

  if (requestedModel && rowModel === requestedModel) score += 120
  if (!rowModel) score += 15
  for (const target of targets) {
    if (rowMatchesTarget(row, target)) score += 55
  }
  if (targets.length === 0) score += 10

  if (isCommercialQuery) {
    if (row.usage_condition === 'commercial_use') score += 30
  } else {
    if (row.usage_condition === 'standard_use' || row.usage_condition === 'general') score += 20
    if (row.usage_condition === 'commercial_use') score -= 25
  }
  if (row.applicability === 'original_vehicle' || row.applicability === 'original_equipment') score += 15

  const searchable = normalize([
    row.model,
    SUBJECT_LABELS[row.subject],
    ACTION_LABELS[row.action ?? ''],
    row.value_text,
  ].filter(Boolean).join(' '))
  for (const token of query.split(' ').filter((token) => token.length >= 3)) {
    if (searchable.includes(token)) score += 2
  }
  return score
}

function scopeFacts(rows: PublishedAfterSalesFactRow[], input: SearchAfterSalesInput) {
  const requestedModel = normalizeModel(input.model)
  if (!requestedModel) return rows

  const inferredPowertrain = inferPowertrain(input.model)
  const exactRows = rows.filter((row) => normalizeModel(row.model) === requestedModel)
  const genericRows = rows.filter((row) => {
    if (normalizeModel(row.model)) return false
    return !inferredPowertrain || !row.powertrain || row.powertrain === 'all' || row.powertrain === inferredPowertrain
  })
  return exactRows.length > 0 ? [...exactRows, ...genericRows] : genericRows
}

function rankFactGroups(rows: PublishedAfterSalesFactRow[], input: SearchAfterSalesInput) {
  const targets = inferTargets(input.query, input.serviceType)
  const groups = new Map<string, PublishedAfterSalesFactRow[]>()

  for (const row of scopeFacts(rows, input)) {
    const groupId = row.interval_group_id || `fact:${row.fact_id}`
    groups.set(groupId, [...(groups.get(groupId) ?? []), row])
  }

  const ranked = [...groups.entries()].map(([id, groupRows]) => ({
    id,
    rows: groupRows,
    score: Math.max(...groupRows.map((row) => rowScore(row, input, targets))),
    matchedTargets: new Set(targets.filter((target) => groupRows.some((row) => rowMatchesTarget(row, target)))),
  })).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))

  const selected: typeof ranked = []
  const selectedIds = new Set<string>()
  const coveredTargets = new Set<string>()
  for (const target of targets) {
    if (coveredTargets.has(target)) continue
    const match = ranked.find((group) => !selectedIds.has(group.id) && group.matchedTargets.has(target))
    if (!match) continue
    selected.push(match)
    selectedIds.add(match.id)
    for (const matchedTarget of match.matchedTargets) coveredTargets.add(matchedTarget)
    if (selected.length >= input.topK) return selected
  }

  // Không lấp đầy topK bằng các nhóm không liên quan khi query đã suy ra target rõ ràng.
  if (targets.length === 0) {
    for (const group of ranked) {
      if (selectedIds.has(group.id)) continue
      selected.push(group)
      if (selected.length >= input.topK) break
    }
  }
  return selected
}

function textValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function factSources(value: unknown): FactSource[] {
  if (!Array.isArray(value)) return []
  const unique = new Map<string, FactSource>()
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const sourceUrl = textValue((item as Record<string, unknown>).source_url)
    if (!sourceUrl) continue
    const source: FactSource = {
      sourceUrl,
      assetUrl: textValue((item as Record<string, unknown>).asset_url),
      pdfPage: numberValue((item as Record<string, unknown>).pdf_page),
      excerpt: textValue((item as Record<string, unknown>).excerpt)?.slice(0, 520),
      capturedAt: textValue((item as Record<string, unknown>).captured_at),
    }
    const key = `${source.sourceUrl}|${source.assetUrl ?? ''}|${source.pdfPage ?? ''}`
    if (!unique.has(key)) unique.set(key, source)
  }
  return [...unique.values()].slice(0, 2)
}

function valueText(row: PublishedAfterSalesFactRow): string {
  const raw = textValue(row.value_text)
    ? row.value_text!.trim()
    : [row.value_numeric, row.unit].filter((value) => value !== null && value !== '').join(' ')
  return raw.replace(/(\d)(km|m|year|month|day|hour|minute)\b/gi, '$1 $2')
}

function afterSalesRoute(serviceType: SearchAfterSalesInput['serviceType'], vehicleType?: string): string {
  const vehicle = vehicleType === 'motorbike' ? 'motorbike' : 'car'
  const anchor = {
    warranty: 'warranty-term',
    maintenance: 'maintenance-schedule',
    repair: 'repair-process',
    rescue: 'rescue-information',
  }[serviceType]
  return `/after-sales?vehicle=${vehicle}&tab=${serviceType}#${anchor}`
}

function factGroupSummary(rows: PublishedAfterSalesFactRow[]): string {
  const first = rows[0]
  const sorted = [...rows].sort((left, right) => {
    const order = (row: PublishedAfterSalesFactRow) => {
      if (first.service_type === 'maintenance') return row.unit === 'km' ? 0 : 1
      return row.unit === 'year' || row.unit === 'month' ? 0 : 1
    }
    return order(left) - order(right) || left.fact_id.localeCompare(right.fact_id)
  })
  const relation = rows.some((row) => row.interval_relation === 'or' || row.qualifier === 'whichever_comes_first')
    ? ' hoặc '
    : ', '
  let values = sorted.map(valueText).join(relation)
  if (rows.length === 1 && first.distance_policy === 'unlimited') {
    values += ', không giới hạn quãng đường'
  }
  const action = ACTION_LABELS[first.action ?? ''] ?? 'Thông tin'
  const subject = SUBJECT_LABELS[first.subject] ?? first.subject.replaceAll('_', ' ')
  const model = first.model ? `${first.model} — ` : ''
  const context = [USAGE_LABELS[first.usage_condition ?? ''], APPLICABILITY_LABELS[first.applicability ?? '']]
    .filter(Boolean)
    .join(', ')
  return `${model}${action} ${subject}: ${values}${context ? ` (${context})` : ''}.`
}

function factEvidence(row: PublishedAfterSalesFactRow, release: PublishedReleaseRow): EvidenceRecord {
  const sources = factSources(row.evidence)
  return {
    evidenceId: `ev-after-sales-${row.fact_id}-${release.release_id}`,
    source: { system: 'SUPABASE', resource: 'after_sales_published_facts' },
    entity: { kind: 'AFTER_SALES_FACT', id: row.fact_id },
    facts: [
      { factRef: `fact-after-sales-value-${row.fact_id}`, factPath: 'valueText', valueHash: valueText(row) },
      {
        factRef: `fact-after-sales-context-${row.fact_id}`,
        factPath: 'context',
        valueHash: [row.service_type, row.vehicle_type, row.model, row.subject, row.usage_condition, row.applicability].join('|'),
      },
      {
        factRef: `fact-after-sales-source-${row.fact_id}`,
        factPath: 'sourceUrl',
        valueHash: sources[0]?.sourceUrl ?? afterSalesRoute(row.service_type, row.vehicle_type),
      },
    ],
    readAt: new Date().toISOString(),
    sourceUpdatedAt: row.updated_at ?? release.published_at,
  }
}

export async function searchAfterSalesRepository(
  input: SearchAfterSalesInput,
  toolCallId: string = `call-after-sales-${Date.now()}`,
): Promise<ToolResult> {
  const readAt = new Date().toISOString()
  const supabase = getSupabaseAdmin()
  let indexQuery = supabase
    .from('after_sales_published_facts')
    .select(FACT_INDEX_COLUMNS)
    .eq('service_type', input.serviceType)
  if (input.vehicleType) indexQuery = indexQuery.eq('vehicle_type', input.vehicleType)

  const [releaseResult, indexResult] = await Promise.all([
    supabase.from('after_sales_current_published_release').select('release_id,published_at').maybeSingle(),
    indexQuery,
  ])
  if (releaseResult.error) throw new Error(releaseResult.error.message)
  if (indexResult.error) throw new Error(indexResult.error.message)
  if (!releaseResult.data) throw new Error('No published after-sales release is available')

  const release = releaseResult.data as PublishedReleaseRow
  const indexRows = (indexResult.data ?? []) as unknown as PublishedAfterSalesFactRow[]
  const expectedTargets = inferTargets(input.query, input.serviceType)
  const selectedGroups = rankFactGroups(indexRows, input)
  const coveredTargets = new Set(
    selectedGroups.flatMap((group) => [...group.matchedTargets]),
  )
  const targetCoverageComplete = expectedTargets.every((target) => coveredTargets.has(target))
  const selectedFactIds = selectedGroups.flatMap((group) => group.rows.map((row) => row.fact_id))
  const observation: ToolObservationRef = {
    observationId: `obs-${toolCallId}`,
    toolCallId,
    outcome: selectedFactIds.length > 0 ? 'SUCCESS' : 'NO_MATCH',
    issueCodes: selectedFactIds.length > 0 ? [] : ['UNKNOWN_ENTITY_REFERENCE'],
    inputHash: JSON.stringify(input),
    readAt,
  }

  if (selectedFactIds.length === 0) {
    return {
      schemaVersion: '2.0',
      toolCallId,
      tool: 'search_after_sales',
      readAt,
      dataAsOf: release.published_at,
      evidence: [],
      observation,
      issues: [{ code: 'UNKNOWN_ENTITY_REFERENCE', message: 'Không có fact hậu mãi đã publish phù hợp.' }],
      appliedBindings: [],
      outcome: 'NO_MATCH',
      data: { groups: [], releaseId: release.release_id },
    }
  }

  const detailResult = await supabase
    .from('after_sales_published_facts')
    .select(FACT_DETAIL_COLUMNS)
    .in('fact_id', selectedFactIds)
  if (detailResult.error) throw new Error(detailResult.error.message)
  const detailById = new Map(
    ((detailResult.data ?? []) as unknown as PublishedAfterSalesFactRow[]).map((row) => [row.fact_id, row]),
  )
  const details = selectedFactIds.map((id) => detailById.get(id)).filter(Boolean) as PublishedAfterSalesFactRow[]
  if (details.some((row) => row.release_id !== release.release_id)) {
    throw new Error('Published after-sales facts belong to another release')
  }

  const detailsByGroup = new Map<string, PublishedAfterSalesFactRow[]>()
  for (const row of details) {
    const groupId = row.interval_group_id || `fact:${row.fact_id}`
    detailsByGroup.set(groupId, [...(detailsByGroup.get(groupId) ?? []), row])
  }
  const route = afterSalesRoute(input.serviceType, input.vehicleType ?? details[0]?.vehicle_type)
  const groups = selectedGroups.flatMap((selected) => {
    const rows = detailsByGroup.get(selected.id)
    if (!rows?.length) return []
    return [{
      id: selected.id,
      summary: factGroupSummary(rows),
      serviceType: rows[0].service_type,
      vehicleType: rows[0].vehicle_type,
      model: rows[0].model,
      subject: rows[0].subject,
      usageCondition: rows[0].usage_condition,
      applicability: rows[0].applicability,
      batteryChemistry: rows[0].battery_chemistry,
      relation: rows.some((row) => row.interval_relation === 'or') ? 'or' : null,
      facts: rows.map((row) => ({
        id: row.fact_id,
        factType: row.fact_type,
        action: row.action,
        valueText: valueText(row),
        unit: row.unit,
        qualifier: row.qualifier,
        distancePolicy: row.distance_policy,
        sources: factSources(row.evidence),
      })),
      internalUrl: afterSalesRoute(rows[0].service_type, rows[0].vehicle_type),
    }]
  })

  return {
    schemaVersion: '2.0',
    toolCallId,
    tool: 'search_after_sales',
    readAt,
    dataAsOf: release.published_at,
    evidence: details.map((row) => factEvidence(row, release)),
    observation,
    issues: [],
    appliedBindings: [],
    outcome: 'SUCCESS',
    completeness: groups.length === selectedGroups.length && targetCoverageComplete ? 'FULL' : 'PARTIAL',
    data: {
      releaseId: release.release_id,
      publishedAt: release.published_at,
      route,
      groups,
    },
  }
}

function inferredProvince(query: string, rows: PublishedServiceLocationRow[]): string | undefined {
  const normalizedQuery = normalize(query)
  if (/\b(?:tp hcm|tphcm|hcm|sai gon|ho chi minh)\b/.test(normalizedQuery)) return 'ho chi minh'
  if (/\b(?:ha noi|hn)\b/.test(normalizedQuery)) return 'ha noi'
  return rows
    .map((row) => normalize(row.address?.province))
    .find((province) => province && normalizedQuery.includes(province))
}

function normalizeAdministrativeName(value: unknown): string {
  const normalized = normalize(value).replace(/\b(?:thanh pho|tinh|tp)\b/g, '').replace(/\s+/g, ' ').trim()
  if (/^(?:hcm|tphcm|sai gon|ho chi minh)$/.test(normalized)) return 'ho chi minh'
  if (/^(?:hn|ha noi)$/.test(normalized)) return 'ha noi'
  return normalized
}

function locationField(row: PublishedServiceLocationRow, group: 'address' | 'contact' | 'service_hours', key: string) {
  return textValue(row[group]?.[key])
}

function locationNumber(row: PublishedServiceLocationRow, key: string) {
  return numberValue(row.address?.[key])
}

function workshopRoute(vehicleType?: string): string {
  return `/after-sales?vehicle=${vehicleType === 'motorbike' ? 'motorbike' : 'car'}&tab=workshop`
}

function locationEvidence(row: PublishedServiceLocationRow, release: PublishedReleaseRow): EvidenceRecord {
  const fullAddress = locationField(row, 'address', 'fullAddress') ?? ''
  const opensAt = locationField(row, 'service_hours', 'opensAt') ?? ''
  const closesAt = locationField(row, 'service_hours', 'closesAt') ?? ''
  const servicePhone = locationField(row, 'contact', 'servicePhone')
    ?? locationField(row, 'contact', 'generalPhone')
    ?? ''
  return {
    evidenceId: `ev-service-location-${row.location_id}-${release.release_id}`,
    source: { system: 'SUPABASE', resource: 'after_sales_published_service_locations' },
    entity: { kind: 'SERVICE_LOCATION', id: row.location_id },
    facts: [
      { factRef: `fact-location-name-${row.location_id}`, factPath: 'name', valueHash: row.name },
      { factRef: `fact-location-address-${row.location_id}`, factPath: 'address', valueHash: fullAddress },
      { factRef: `fact-location-hours-${row.location_id}`, factPath: 'operatingHours', valueHash: `${opensAt}-${closesAt}` },
      { factRef: `fact-location-phone-${row.location_id}`, factPath: 'phone', valueHash: servicePhone },
    ],
    readAt: new Date().toISOString(),
    sourceUpdatedAt: row.updated_at ?? release.published_at,
  }
}

export async function findServiceLocationsRepository(
  input: FindServiceLocationsInput,
  toolCallId: string = `call-service-locations-${Date.now()}`,
): Promise<ToolResult> {
  const readAt = new Date().toISOString()
  const supabase = getSupabaseAdmin()
  const [releaseResult, locationsResult] = await Promise.all([
    supabase.from('after_sales_current_published_release').select('release_id,published_at').maybeSingle(),
    supabase
      .from('after_sales_published_service_locations')
      .select(LOCATION_COLUMNS)
      .eq('operational_status', 'active'),
  ])
  if (releaseResult.error) throw new Error(releaseResult.error.message)
  if (locationsResult.error) throw new Error(locationsResult.error.message)
  if (!releaseResult.data) throw new Error('No published after-sales release is available')

  const release = releaseResult.data as PublishedReleaseRow
  const allRows = (locationsResult.data ?? []) as unknown as PublishedServiceLocationRow[]
  const requestedProvince = normalizeAdministrativeName(input.province)
    || inferredProvince(input.query, allRows)
  const requestedDistrict = normalizeAdministrativeName(input.district)
  const rows = allRows.filter((row) => {
    if (row.release_id !== release.release_id) return false
    if (input.vehicleType && !row.vehicle_types?.includes(input.vehicleType)) return false
    if (input.category && row.location_category !== input.category) return false
    if (requestedProvince && normalizeAdministrativeName(row.address?.province) !== requestedProvince) return false
    if (requestedDistrict) {
      const district = normalizeAdministrativeName(row.address?.district)
      if (!district.includes(requestedDistrict) && !requestedDistrict.includes(district)) return false
    }
    return true
  }).sort((left, right) => {
    const leftDistrict = normalizeAdministrativeName(left.address?.district)
    const rightDistrict = normalizeAdministrativeName(right.address?.district)
    const query = normalize(input.query)
    const leftScore = query.includes(normalize(left.name)) ? 2 : query.includes(leftDistrict) ? 1 : 0
    const rightScore = query.includes(normalize(right.name)) ? 2 : query.includes(rightDistrict) ? 1 : 0
    return rightScore - leftScore || left.name.localeCompare(right.name, 'vi')
  })
  // Do not let an overly small model-generated limit hide nearby workshops.
  // Eight keeps the response bounded while covering the complete current city-level sets.
  const effectiveLimit = Math.max(input.limit, 8)
  const selected = rows.slice(0, effectiveLimit)
  const observation: ToolObservationRef = {
    observationId: `obs-${toolCallId}`,
    toolCallId,
    outcome: selected.length > 0 ? 'SUCCESS' : 'NO_MATCH',
    issueCodes: selected.length > 0 ? [] : ['UNKNOWN_ENTITY_REFERENCE'],
    inputHash: JSON.stringify(input),
    readAt,
  }

  if (selected.length === 0) {
    return {
      schemaVersion: '2.0',
      toolCallId,
      tool: 'find_service_locations',
      readAt,
      dataAsOf: release.published_at,
      evidence: [],
      observation,
      issues: [{ code: 'UNKNOWN_ENTITY_REFERENCE', message: 'Không tìm thấy xưởng dịch vụ đã publish phù hợp.' }],
      appliedBindings: [],
      outcome: 'NO_MATCH',
      data: { locations: [], totalMatches: 0, releaseId: release.release_id },
    }
  }

  const route = workshopRoute(input.vehicleType ?? selected[0].vehicle_types?.[0])
  return {
    schemaVersion: '2.0',
    toolCallId,
    tool: 'find_service_locations',
    readAt,
    dataAsOf: release.published_at,
    evidence: selected.map((row) => locationEvidence(row, release)),
    observation,
    issues: [],
    appliedBindings: [],
    outcome: 'SUCCESS',
    completeness: rows.length > selected.length ? 'PARTIAL' : 'FULL',
    data: {
      releaseId: release.release_id,
      publishedAt: release.published_at,
      route,
      totalMatches: rows.length,
      hasMore: rows.length > selected.length,
      locations: selected.map((row) => ({
        id: row.location_id,
        name: row.name,
        category: row.location_category,
        categoryLabel: row.category_label,
        vehicleTypes: row.vehicle_types ?? [],
        address: {
          province: locationField(row, 'address', 'province'),
          district: locationField(row, 'address', 'district'),
          fullAddress: locationField(row, 'address', 'fullAddress'),
          latitude: locationNumber(row, 'latitude'),
          longitude: locationNumber(row, 'longitude'),
          directionsUrl: locationField(row, 'address', 'directionsUrl'),
        },
        phone: locationField(row, 'contact', 'servicePhone')
          ?? locationField(row, 'contact', 'generalPhone'),
        operatingHours: {
          opensAt: locationField(row, 'service_hours', 'opensAt'),
          closesAt: locationField(row, 'service_hours', 'closesAt'),
          applicableDays: row.service_hours?.applicableDays ?? null,
        },
        sourceUrl: textValue(row.evidence?.sourceUrl),
        internalUrl: workshopRoute(row.vehicle_types?.[0]),
      })),
    },
  }
}
