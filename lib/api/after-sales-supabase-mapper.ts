import type {
  AfterSalesData,
  MaintenanceMilestone,
  MaintenanceServiceItem,
  RepairServiceItem,
  RescuePolicyItem,
  ServiceWorkshopItem,
  WarrantyFactItem,
} from './after-sales-types'

export interface PublishedAfterSalesReleaseRow {
  release_id: string
  published_at: string
  counts: {
    facts?: number
    serviceLocations?: number
    [key: string]: unknown
  } | null
}

export interface PublishedAfterSalesFactRow {
  fact_id: string
  release_id: string
  service_type: string
  vehicle_type: string
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
}

export interface PublishedAfterSalesLocationRow {
  location_id: string
  release_id: string
  name: string
  location_category: string
  vehicle_types: string[] | null
  service_types: string[] | null
  bookable_service_types: string[] | null
  capability_granularity: string
  address: Record<string, unknown> | null
  contact: Record<string, unknown> | null
  service_hours: Record<string, unknown> | null
  operational_status: string
}

interface CoveragePair {
  term: string
  duration: PublishedAfterSalesFactRow
  distance?: PublishedAfterSalesFactRow
}

const viCollator = new Intl.Collator('vi', { sensitivity: 'base', numeric: true })

const SUBJECT_LABELS: Record<string, string> = {
  air_conditioning_system: 'hệ thống điều hòa',
  battery: 'pin cao áp',
  battery_12v: 'ắc quy 12V',
  battery_coolant: 'nước làm mát pin',
  brake_fluid: 'dầu phanh',
  brake_system: 'hệ thống phanh',
  cabin_air_filter: 'lọc gió điều hòa',
  engine_air_filter: 'lọc gió động cơ',
  engine_oil: 'dầu động cơ',
  first_service: 'bảo dưỡng đầu tiên',
  key_fob_battery: 'pin chìa khóa',
  seat_lock_and_stands: 'khóa yên và chân chống',
  steering_head_bearing: 'vòng bi cổ lái',
  tbox_battery: 'pin T-Box',
  tire: 'lốp xe',
  vehicle: 'toàn bộ xe',
}

const ACTION_LABELS: Record<string, string> = {
  first_service: 'Bảo dưỡng đầu tiên',
  inspect: 'Kiểm tra',
  lubricate: 'Bôi trơn',
  replace: 'Thay thế',
  rotate: 'Đảo',
  scheduled_service: 'Bảo dưỡng định kỳ',
}

function numericValue(value: number | string | null): number | null {
  if (value === null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function factValue(fact: PublishedAfterSalesFactRow): string {
  const explicit = textValue(fact.value_text)
  if (explicit) return explicit

  const numeric = numericValue(fact.value_numeric)
  if (numeric === null) return 'Chưa cập nhật'
  return `${numeric.toLocaleString('vi-VN')} ${textValue(fact.unit)}`.trim()
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function formatCoveragePair(
  rows: PublishedAfterSalesFactRow[],
  durationType: string,
  distanceType: string,
): CoveragePair | null {
  const duration = rows
    .filter((fact) => fact.fact_type === durationType)
    .sort((left, right) => left.fact_id.localeCompare(right.fact_id))[0]

  if (!duration) return null

  const distance = rows
    .filter((fact) => fact.fact_type === distanceType)
    .sort((left, right) => left.fact_id.localeCompare(right.fact_id))[0]
  const durationText = factValue(duration)

  if (distance) {
    const relation =
      duration.interval_relation === 'or' ||
      distance.interval_relation === 'or' ||
      duration.qualifier === 'whichever_comes_first' ||
      distance.qualifier === 'whichever_comes_first'
        ? ' hoặc '
        : ' / '
    return { term: `${durationText}${relation}${factValue(distance)}`, duration, distance }
  }

  if (duration.distance_policy === 'unlimited') {
    return { term: `${durationText}, không giới hạn số km`, duration }
  }

  return { term: durationText, duration }
}

function modelFacts(
  facts: PublishedAfterSalesFactRow[],
  model: string,
  predicate: (fact: PublishedAfterSalesFactRow) => boolean,
): PublishedAfterSalesFactRow[] {
  return facts.filter((fact) => fact.model === model && predicate(fact))
}

function mapWarrantyFacts(facts: PublishedAfterSalesFactRow[]): WarrantyFactItem[] {
  const warrantyFacts = facts.filter((fact) => fact.service_type === 'warranty')
  const carModels = Array.from(
    new Set(
      warrantyFacts
        .filter(
          (fact) =>
            fact.vehicle_type === 'car' &&
            fact.model &&
            fact.subject === 'vehicle' &&
            fact.usage_condition === 'standard_use' &&
            fact.applicability === 'original_vehicle' &&
            fact.fact_type === 'vehicle_warranty_duration',
        )
        .map((fact) => fact.model as string),
    ),
  ).sort(viCollator.compare)

  const groups = new Map<
    string,
    {
      models: string[]
      vehicleCoverage: CoveragePair
      batteryCoverage: CoveragePair | null
      batteryCapacity: string | null
      commercialCoverage: string | null
    }
  >()

  for (const model of carModels) {
    const vehicleCoverage = formatCoveragePair(
      modelFacts(
        warrantyFacts,
        model,
        (fact) =>
          fact.vehicle_type === 'car' &&
          fact.subject === 'vehicle' &&
          fact.usage_condition === 'standard_use' &&
          fact.applicability === 'original_vehicle',
      ),
      'vehicle_warranty_duration',
      'vehicle_warranty_distance',
    )
    if (!vehicleCoverage) continue

    const batteryCoverage = formatCoveragePair(
      modelFacts(
        warrantyFacts,
        model,
        (fact) =>
          fact.vehicle_type === 'car' &&
          fact.subject === 'battery' &&
          fact.usage_condition === 'standard_use' &&
          fact.applicability === 'original_equipment',
      ),
      'battery_warranty_duration',
      'battery_warranty_distance',
    )
    const capacityFact = modelFacts(
      warrantyFacts,
      model,
      (fact) =>
        fact.vehicle_type === 'car' &&
        fact.subject === 'battery' &&
        fact.applicability === 'original_equipment' &&
        fact.fact_type === 'battery_capacity_threshold',
    )[0]
    const batteryCapacity = capacityFact ? factValue(capacityFact) : null

    const commercialVehicle = formatCoveragePair(
      modelFacts(
        warrantyFacts,
        model,
        (fact) =>
          fact.vehicle_type === 'car' &&
          fact.subject === 'vehicle' &&
          fact.usage_condition === 'commercial_use' &&
          fact.applicability === 'original_vehicle',
      ),
      'vehicle_warranty_duration',
      'vehicle_warranty_distance',
    )
    const commercialBattery = formatCoveragePair(
      modelFacts(
        warrantyFacts,
        model,
        (fact) =>
          fact.vehicle_type === 'car' &&
          fact.subject === 'battery' &&
          fact.usage_condition === 'commercial_use' &&
          fact.applicability === 'original_equipment',
      ),
      'battery_warranty_duration',
      'battery_warranty_distance',
    )
    const commercialCoverage = commercialVehicle
      ? [
          `Xe: ${commercialVehicle.term}`,
          commercialBattery ? `pin: ${commercialBattery.term}` : null,
        ]
          .filter(Boolean)
          .join('; ')
      : null

    const groupKey = JSON.stringify({
      vehicle: vehicleCoverage.term,
      battery: batteryCoverage?.term ?? null,
      capacity: batteryCapacity,
      commercial: commercialCoverage,
    })
    const existing = groups.get(groupKey)
    if (existing) {
      existing.models.push(model)
    } else {
      groups.set(groupKey, {
        models: [model],
        vehicleCoverage,
        batteryCoverage,
        batteryCapacity,
        commercialCoverage,
      })
    }
  }

  const mapped: WarrantyFactItem[] = Array.from(groups.values())
    .sort((left, right) => {
      const durationDifference =
        (numericValue(right.vehicleCoverage.duration.value_numeric) ?? 0) -
        (numericValue(left.vehicleCoverage.duration.value_numeric) ?? 0)
      return durationDifference || viCollator.compare(left.models[0], right.models[0])
    })
    .map((group) => {
      const batteryTerm = group.batteryCoverage
        ? `${group.batteryCoverage.term}${
            group.batteryCapacity
              ? ` (ngưỡng dung lượng tối thiểu ${group.batteryCapacity})`
              : ''
          }`
        : 'Không có chính sách pin tương ứng trong dữ liệu đã duyệt'
      const conditions = [
        'Áp dụng cho xe nguyên bản trong điều kiện sử dụng tiêu chuẩn.',
        'Thời hạn hoặc quãng đường được tính theo điều kiện đến trước.',
      ]
      if (group.batteryCoverage) {
        conditions.push('Bảo hành pin áp dụng cho pin nguyên bản theo phạm vi đã công bố.')
      }
      if (group.batteryCapacity) {
        conditions.push(`Ngưỡng dung lượng pin tối thiểu được công bố: ${group.batteryCapacity}.`)
      }

      return {
        id: `published-car-${slugify(group.models.join('-'))}`,
        vehicleType: 'car',
        modelSeries:
          group.models.length === 1
            ? group.models[0]
            : `Nhóm chính sách ${group.vehicleCoverage.term}`,
        models: group.models.sort(viCollator.compare),
        warrantyTerm: group.vehicleCoverage.term,
        batteryWarrantyTerm: batteryTerm,
        batteryCapacityWarranty: group.batteryCapacity ?? undefined,
        commercialWarranty: group.commercialCoverage ?? undefined,
        conditions,
        highlight:
          (numericValue(group.vehicleCoverage.duration.value_numeric) ?? 0) >= 10
            ? 'long_term'
            : undefined,
      }
    })

  const motorbikeBattery = formatCoveragePair(
    warrantyFacts.filter(
      (fact) =>
        fact.vehicle_type === 'motorbike' &&
        fact.subject === 'battery' &&
        fact.battery_chemistry === 'lfp' &&
        fact.usage_condition === 'standard_use' &&
        fact.applicability === 'original_equipment',
    ),
    'battery_warranty_duration',
    'battery_warranty_distance',
  )

  if (motorbikeBattery) {
    const battery12v = formatCoveragePair(
      warrantyFacts.filter(
        (fact) =>
          fact.vehicle_type === 'motorbike' &&
          fact.subject === 'battery_12v' &&
          fact.usage_condition === 'standard_use' &&
          fact.applicability === 'original_equipment',
      ),
      'battery_12v_warranty_duration',
      'battery_12v_warranty_distance',
    )
    mapped.push({
      id: 'published-motorbike-lfp-original-battery',
      vehicleType: 'motorbike',
      modelSeries: 'Pin LFP nguyên bản',
      models: ['Các mẫu xe máy điện sử dụng pin LFP'],
      warrantyTerm: 'Chưa có dữ liệu bảo hành toàn xe đã duyệt',
      batteryWarrantyTerm: motorbikeBattery.term,
      conditions: [
        'Áp dụng cho pin LFP nguyên bản trong điều kiện sử dụng tiêu chuẩn.',
        ...(battery12v ? [`Ắc quy 12V nguyên bản: ${battery12v.term}.`] : []),
      ],
    })
  }

  return mapped
}

function monthsFromFact(fact?: PublishedAfterSalesFactRow): number {
  if (!fact) return 0
  const value = numericValue(fact.value_numeric) ?? 0
  if (fact.unit === 'year') return value * 12
  if (fact.unit === 'month') return value
  return 0
}

function pairedTimeFact(
  distanceFact: PublishedAfterSalesFactRow,
  facts: PublishedAfterSalesFactRow[],
): PublishedAfterSalesFactRow | undefined {
  if (!distanceFact.interval_group_id) return undefined
  return facts.find(
    (fact) =>
      fact.interval_group_id === distanceFact.interval_group_id &&
      fact.fact_type === 'maintenance_interval_time',
  )
}

function subjectLabel(subject: string): string {
  return SUBJECT_LABELS[subject] ?? subject.replaceAll('_', ' ')
}

function actionLabel(action: string | null): string {
  return ACTION_LABELS[action ?? ''] ?? 'Thực hiện'
}

function maintenanceStatement(
  fact: PublishedAfterSalesFactRow,
  scopeFacts: PublishedAfterSalesFactRow[],
): string {
  const pair =
    fact.fact_type === 'maintenance_interval_distance'
      ? pairedTimeFact(fact, scopeFacts)
      : fact.interval_group_id
        ? scopeFacts.find(
            (candidate) =>
              candidate.interval_group_id === fact.interval_group_id &&
              candidate.fact_type === 'maintenance_interval_distance',
          )
        : undefined
  const values =
    fact.fact_type === 'maintenance_interval_distance'
      ? [factValue(fact), pair ? factValue(pair) : null]
      : [pair ? factValue(pair) : null, factValue(fact)]
  return `${actionLabel(fact.action)} ${subjectLabel(fact.subject)}: ${values
    .filter(Boolean)
    .join(pair ? ' hoặc ' : '')}`
}

function buildMaintenanceChecklist(
  scopeFacts: PublishedAfterSalesFactRow[],
): MaintenanceServiceItem['checklist'] {
  const seenGroups = new Set<string>()
  const categorized = new Map<string, Set<string>>()

  for (const fact of [...scopeFacts].sort((left, right) => left.fact_id.localeCompare(right.fact_id))) {
    if (fact.interval_group_id && seenGroups.has(fact.interval_group_id)) continue
    if (fact.interval_group_id) seenGroups.add(fact.interval_group_id)

    const category =
      fact.action === 'inspect'
        ? 'Hạng mục kiểm tra'
        : fact.action === 'replace' || fact.action === 'lubricate' || fact.action === 'rotate'
          ? 'Thay thế & chăm sóc'
          : 'Mốc bảo dưỡng'
    const items = categorized.get(category) ?? new Set<string>()
    items.add(maintenanceStatement(fact, scopeFacts))
    categorized.set(category, items)
  }

  return Array.from(categorized, ([category, items]) => ({
    category,
    items: Array.from(items).sort(viCollator.compare),
  }))
}

function milestoneFromDistanceFact(
  distanceFact: PublishedAfterSalesFactRow,
  scopeFacts: PublishedAfterSalesFactRow[],
): MaintenanceMilestone {
  const mileage = numericValue(distanceFact.value_numeric) ?? 0
  const timeFact = pairedTimeFact(distanceFact, scopeFacts)
  const relatedItems = Array.from(
    new Set(
      scopeFacts
        .filter(
          (fact) =>
            fact.fact_type === 'maintenance_interval_distance' &&
            numericValue(fact.value_numeric) === mileage,
        )
        .map((fact) => `${actionLabel(fact.action)} ${subjectLabel(fact.subject)}`),
    ),
  ).sort(viCollator.compare)

  return {
    mileageKm: mileage,
    months: monthsFromFact(timeFact),
    level:
      distanceFact.action === 'first_service'
        ? 'Bảo dưỡng đầu tiên'
        : distanceFact.action === 'scheduled_service'
          ? 'Bảo dưỡng định kỳ'
          : `Mốc ${factValue(distanceFact)}`,
    description: timeFact
      ? `Thực hiện tại ${factValue(distanceFact)} hoặc ${factValue(timeFact)}, theo điều kiện đến trước.`
      : `Hạng mục được công bố tại mốc ${factValue(distanceFact)}.`,
    estimatedDuration: 'Liên hệ xưởng',
    keyItems: relatedItems,
  }
}

function mapMaintenanceFacts(facts: PublishedAfterSalesFactRow[]): MaintenanceServiceItem[] {
  const maintenanceFacts = facts.filter((fact) => fact.service_type === 'maintenance')
  const primarySchedules = maintenanceFacts.filter(
    (fact) =>
      fact.vehicle_type === 'car' &&
      fact.fact_type === 'maintenance_interval_distance' &&
      (fact.action === 'scheduled_service' || fact.action === 'first_service') &&
      (fact.subject === 'vehicle' || fact.subject === 'first_service'),
  )
  const scheduleGroups = new Map<
    string,
    {
      models: string[]
      primary: PublishedAfterSalesFactRow
      generic: boolean
    }
  >()

  for (const schedule of primarySchedules) {
    const time = pairedTimeFact(schedule, maintenanceFacts)
    const generic = !schedule.model
    const key = JSON.stringify({
      action: schedule.action,
      distance: numericValue(schedule.value_numeric),
      time: time ? `${time.value_numeric}:${time.unit}` : null,
      powertrain: schedule.powertrain,
      generic,
    })
    const group = scheduleGroups.get(key)
    if (group && schedule.model) {
      group.models.push(schedule.model)
    } else if (!group) {
      scheduleGroups.set(key, {
        models: schedule.model ? [schedule.model] : [],
        primary: schedule,
        generic,
      })
    }
  }

  const mapped: MaintenanceServiceItem[] = Array.from(scheduleGroups.values())
    .sort((left, right) => {
      if (left.generic !== right.generic) return left.generic ? -1 : 1
      return (
        (numericValue(left.primary.value_numeric) ?? 0) -
          (numericValue(right.primary.value_numeric) ?? 0) ||
        viCollator.compare(left.models[0] ?? '', right.models[0] ?? '')
      )
    })
    .map((group) => {
      const scopeFacts = maintenanceFacts.filter((fact) => {
        if (fact.vehicle_type !== 'car') return false
        if (group.generic) {
          return !fact.model && fact.powertrain === group.primary.powertrain
        }
        return Boolean(fact.model && group.models.includes(fact.model))
      })
      const sortedModels = group.models.sort(viCollator.compare)
      return {
        id: group.generic
          ? `published-maintenance-car-${slugify(group.primary.powertrain ?? 'general')}`
          : `published-maintenance-${slugify(sortedModels.join('-'))}`,
        vehicleType: 'car',
        title: group.generic
          ? 'Lịch bảo dưỡng chung cho ô tô điện'
          : `Lịch bảo dưỡng ${sortedModels.join(' / ')}`,
        description: group.generic
          ? 'Mốc bảo dưỡng chung theo dữ liệu chính thức đã được duyệt.'
          : `Mốc bảo dưỡng áp dụng cho ${sortedModels.join(', ')}.`,
        intervals: [milestoneFromDistanceFact(group.primary, scopeFacts)],
        checklist: buildMaintenanceChecklist(scopeFacts),
        mobileServiceAvailable: false,
      }
    })

  const motorbikeFacts = maintenanceFacts.filter((fact) => fact.vehicle_type === 'motorbike')
  const motorbikeDistanceFacts = motorbikeFacts.filter(
    (fact) => fact.fact_type === 'maintenance_interval_distance',
  )
  const motorbikeDistanceGroups = new Map<number, PublishedAfterSalesFactRow[]>()
  for (const distanceFact of motorbikeDistanceFacts) {
    const mileage = numericValue(distanceFact.value_numeric) ?? 0
    const group = motorbikeDistanceGroups.get(mileage) ?? []
    group.push(distanceFact)
    motorbikeDistanceGroups.set(mileage, group)
  }
  const motorbikeMilestones = Array.from(motorbikeDistanceGroups.entries())
    .sort(([left], [right]) => left - right)
    .map(([, distanceFacts]) => {
      const representative = [...distanceFacts].sort((left, right) => {
        const leftHasTime = pairedTimeFact(left, motorbikeFacts) ? 1 : 0
        const rightHasTime = pairedTimeFact(right, motorbikeFacts) ? 1 : 0
        return rightHasTime - leftHasTime || left.fact_id.localeCompare(right.fact_id)
      })[0]
      return milestoneFromDistanceFact(representative, motorbikeFacts)
    })

  if (motorbikeMilestones.length > 0) {
    mapped.push({
      id: 'published-maintenance-motorbike-general',
      vehicleType: 'motorbike',
      title: 'Lịch bảo dưỡng xe máy điện',
      description: 'Các mốc kiểm tra và chăm sóc xe máy điện theo dữ liệu đã được duyệt.',
      intervals: motorbikeMilestones,
      checklist: buildMaintenanceChecklist(motorbikeFacts),
      mobileServiceAvailable: false,
    })
  }

  return mapped
}

function mapRepairFacts(facts: PublishedAfterSalesFactRow[]): RepairServiceItem[] {
  return facts
    .filter((fact) => fact.service_type === 'repair')
    .sort((left, right) => left.fact_id.localeCompare(right.fact_id))
    .map((fact) => ({
      id: `published-repair-${fact.fact_id}`,
      title: 'Đặt lịch sửa chữa',
      description:
        fact.fact_type === 'appointment_arrival_window'
          ? `Mốc đến làm dịch vụ đúng hẹn được ghi nhận trong vòng ${factValue(fact)}.`
          : `${actionLabel(fact.action)} ${subjectLabel(fact.subject)}: ${factValue(fact)}.`,
      badge: 'Dữ liệu đã duyệt',
      features: [
        `Giá trị công bố: ${factValue(fact)}`,
        'Thông tin được đồng bộ từ release chính thức đã qua admin review.',
      ],
    }))
}

function rescueActionText(fact: PublishedAfterSalesFactRow): string {
  if (fact.action === 'customer_callback') {
    return `CSKH liên hệ lại cuộc gọi eCall nhỡ trong ${factValue(fact)}.`
  }
  if (fact.action === 'request_dispatch') {
    return `Chuyển yêu cầu đến đơn vị điều phối trong ${factValue(fact)}.`
  }
  if (fact.action === 'responder_departure') {
    return `Đơn vị cứu hộ hoặc xưởng bắt đầu di chuyển trong ${factValue(fact)}.`
  }
  return `${actionLabel(fact.action)} ${subjectLabel(fact.subject)}: ${factValue(fact)}.`
}

function mapRescueFacts(facts: PublishedAfterSalesFactRow[]): RescuePolicyItem[] {
  const rescueFacts = facts.filter((fact) => fact.service_type === 'rescue')
  if (rescueFacts.length === 0) return []

  const responseFacts = rescueFacts.filter((fact) => fact.fact_type === 'service_response_time')
  const safetyGroups = new Map<string, string[]>()
  for (const fact of rescueFacts.filter((candidate) => candidate.fact_type === 'emergency_safety_wait_time')) {
    const key = factValue(fact)
    const models = safetyGroups.get(key) ?? []
    if (fact.model) models.push(fact.model)
    safetyGroups.set(key, models)
  }

  return [
    {
      id: 'published-rescue-response-policy',
      vehicleType: 'car',
      title: 'Mốc phản hồi cứu hộ',
      description: 'Các mốc xử lý cứu hộ và an toàn điện cao áp đã được admin duyệt.',
      hotline: '',
      operatingHours: 'Theo chính sách cứu hộ được công bố',
      coverage: responseFacts.map(rescueActionText),
      conditions: Array.from(safetyGroups, ([waitTime, models]) =>
        models.length > 0
          ? `Điện áp cao cần khoảng ${waitTime} để tiêu tán trên ${models.sort(viCollator.compare).join(', ')}.`
          : `Điện áp cao cần khoảng ${waitTime} để tiêu tán.`,
      ),
      mobileChargingSupport: false,
    },
  ]
}

function mapServiceLocations(locations: PublishedAfterSalesLocationRow[]): ServiceWorkshopItem[] {
  return locations
    .filter((location) => location.operational_status === 'active')
    .map((location) => {
      const address = location.address ?? {}
      const contact = location.contact ?? {}
      const serviceHours = location.service_hours ?? {}
      const services: ServiceWorkshopItem['services'] = []
      if (location.vehicle_types?.includes('car')) services.push('car')
      if (location.vehicle_types?.includes('motorbike')) services.push('motorbike')

      const opensAt = textValue(serviceHours.opensAt)
      const closesAt = textValue(serviceHours.closesAt)
      return {
        id: location.location_id,
        name: location.name,
        city: textValue(address.province) || 'Chưa cập nhật tỉnh/thành',
        district: textValue(address.district) || 'Chưa cập nhật quận/huyện',
        address: textValue(address.fullAddress) || 'Chưa cập nhật địa chỉ',
        phone:
          textValue(contact.servicePhone) ||
          textValue(contact.generalPhone) ||
          'Chưa cập nhật',
        operatingHours:
          opensAt && closesAt ? `${opensAt} - ${closesAt}` : 'Liên hệ xưởng',
        services,
        latitude: numericValue(address.latitude as number | string | null) ?? undefined,
        longitude: numericValue(address.longitude as number | string | null) ?? undefined,
      }
    })
    .sort(
      (left, right) =>
        viCollator.compare(left.city, right.city) ||
        viCollator.compare(left.district, right.district) ||
        viCollator.compare(left.name, right.name),
    )
}

export function mapPublishedAfterSalesData(input: {
  release: PublishedAfterSalesReleaseRow
  facts: PublishedAfterSalesFactRow[]
  locations: PublishedAfterSalesLocationRow[]
}): AfterSalesData {
  return {
    warranties: mapWarrantyFacts(input.facts),
    maintenances: mapMaintenanceFacts(input.facts),
    repairs: mapRepairFacts(input.facts),
    rescues: mapRescueFacts(input.facts),
    workshops: mapServiceLocations(input.locations),
    sourcesSyncedAt: input.release.published_at,
    releaseId: input.release.release_id,
    dataOrigin: 'supabase_published',
  }
}
