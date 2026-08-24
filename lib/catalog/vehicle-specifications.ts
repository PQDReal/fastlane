import type { CoreVehicleSpecKey } from '@/lib/catalog-intelligence/types'

export type VehicleProductType = 'CAR' | 'BIKE'
export type VehicleSpecKey = CoreVehicleSpecKey

export type NormalizedVehicleSpec = {
  key: VehicleSpecKey
  label: string
  value: number | string | null
  unit?: string
  displayValue: string
  rawValue: unknown
  sourcePath: string
  sourceSchema: 'fastlane_car_v1' | 'fastlane_car_v2' | 'fastlane_bike_v1' | 'fastlane_bike_v2'
  updatedAt: string
  comparable: boolean
}

export type VehicleSpecNormalizationWarning = {
  code: 'UNSUPPORTED_SPEC_SCHEMA'
  message: string
}

export type VehicleSpecNormalizationResult = {
  facts: Partial<Record<VehicleSpecKey, NormalizedVehicleSpec>>
  warnings: VehicleSpecNormalizationWarning[]
}

type JsonRecord = Record<string, unknown>

type SpecDefinition = {
  key: VehicleSpecKey
  label: string
  path?: string
  aliases?: string[]
  unit?: string
}

const CAR_SPECIFICATIONS: SpecDefinition[] = [
  { key: 'dimensions_mm', label: 'Kích thước (D x R x C)', path: 'dimension.length', unit: 'mm' },
  { key: 'range_km', label: 'Quãng đường di chuyển', path: 'powertrain.distance', unit: 'km' },
  { key: 'max_power_kw', label: 'Công suất tối đa', path: 'powertrain.maxPower', unit: 'kW' },
  { key: 'max_torque_nm', label: 'Mô-men xoắn cực đại', path: 'powertrain.maxTorque', unit: 'Nm' },
  { key: 'top_speed_kmh', label: 'Tốc độ tối đa', path: 'powertrain.topSpeed', unit: 'km/h' },
  { key: 'drive_type', label: 'Hệ dẫn động', path: 'powertrain.drivetrain' },
  { key: 'battery_capacity_kwh', label: 'Dung lượng pin', path: 'powertrain.batteryCapacity', unit: 'kWh' },
  { key: 'charging_time', label: 'Thời gian sạc nhanh', path: 'powertrain.fastChargingTime' },
  { key: 'seats', label: 'Số chỗ ngồi', path: 'interior.numberOfSeats', unit: 'chỗ' },
]

const BIKE_SPECIFICATIONS: SpecDefinition[] = [
  { key: 'dimensions_mm', label: 'Kích thước (D x R x C)', aliases: ['dai x rong x cao (mm)', 'dai x rong x cao', 'kich thuoc (d x r x c)'], unit: 'mm' },
  { key: 'range_km', label: 'Quãng đường di chuyển', aliases: ['quang duong di duoc moi lan sac', 'quang duong di duoc', 'quang duong 1 lan sac (2 pin)', 'quang duong', 'pham vi hoat dong'], unit: 'km' },
  { key: 'max_power_kw', label: 'Công suất tối đa', aliases: ['cong suat toi da', 'cong suat lon nhat', 'cong suat'], unit: 'kW' },
  { key: 'max_torque_nm', label: 'Mô-men xoắn cực đại', aliases: ['mo-men xoan cuc dai', 'momen xoan cuc dai'], unit: 'Nm' },
  { key: 'top_speed_kmh', label: 'Tốc độ tối đa', aliases: ['toc do toi da', 'toc do toi da - sport', 'van toc', 'van toc len toi'], unit: 'km/h' },
  { key: 'drive_type', label: 'Loại động cơ', aliases: ['loai dong co'] },
  { key: 'battery_capacity_kwh', label: 'Dung lượng pin', aliases: ['dung luong pin/ac quy', 'dung luong pin', 'dung luong ac quy'], unit: 'kWh' },
  { key: 'charging_time', label: 'Thời gian sạc', aliases: ['thoi gian sac tieu chuan', 'thoi gian sac nhanh'] },
  { key: 'seats', label: 'Số chỗ ngồi', aliases: ['so cho ngoi', 'so nguoi cho'], unit: 'chỗ' },
]

const CAR_STANDARD_SCHEMA = ['dimension', 'exterior', 'interior', 'powertrain', 'safety']
const CAR_NEW_SCHEMA = ['dimension', 'edition', 'id', 'interior', 'powertrain']

// These fingerprints are the two live BIKE shapes audited for Task 016.
// Matching is exact: a new or malformed label set must not be silently parsed.
const BIKE_STANDARD_SCHEMA = [
  'Tiền đặt cọc', 'Màu sắc', 'Dài x Rộng x Cao (mm)',
  'Khoảng cách trục bánh Trước-Sau', 'Khoảng sáng gầm', 'Chiều cao yên',
  'Trọng lượng xe', 'Tải trọng', 'Thể tích cốp', 'Kích thước lốp Trước - Sau',
  'Giảm xóc trước và sau', 'Phanh trước và sau', 'Khóa xe', 'Đèn pha trước',
  'Loại động cơ', 'Công suất danh định', 'Công suất tối đa', 'Tốc độ tối đa',
  'Tốc độ tối đa - SPORT', 'Tốc độ tối đa - ECO', 'Gia tốc 0 - 50 km/h',
  'Gia tốc 0 - 40 km/h', 'Khả năng leo dốc 20%', 'Loại pin/ắc quy',
  'Dung lượng pin/ắc quy', 'Trọng lượng pin/ắc quy', 'Loại sạc',
  'Thời gian sạc tiêu chuẩn', 'Vị trí lắp pin', 'Quãng đường đi được mỗi lần sạc',
  'Tiêu chuẩn chống nước động cơ',
]

const BIKE_ALTERNATE_SCHEMA = [
  'Màu sắc', 'Thời gian sạc tiêu chuẩn', 'Loại động cơ', 'Công suất danh định',
  'Giảm xóc', 'Loại ắc quy', 'Dung lượng ắc quy', 'Công suất lớn nhất',
  'Trọng lượng', 'Dài x Rộng x Cao', 'Phanh trước và sau', 'Vận tốc',
  'Quãng đường 1 lần sạc (2 pin)', 'Cốp xe', 'Công suất', 'Quãng đường',
]

const COMPARE_CAR_FIELDS: Array<[string, string]> = [
  ['dimension.length', 'Kích thước (D x R x C)'],
  ['dimension.wheelbase', 'Chiều dài cơ sở (mm)'],
  ['dimension.croundClearance', 'Khoảng sáng gầm xe (mm)'],
  ['dimension.kurbWeightPayload', 'Khối lượng / tải trọng (kg)'],
  ['powertrain.distance', 'Quãng đường di chuyển'],
  ['powertrain.maxPower', 'Công suất tối đa'],
  ['powertrain.maxTorque', 'Mô-men xoắn cực đại (Nm)'],
  ['powertrain.topSpeed', 'Tốc độ tối đa (km/h)'],
  ['powertrain.drivetrain', 'Hệ dẫn động'],
  ['powertrain.drivingModes', 'Chế độ lái'],
  ['powertrain.batteryCapacity', 'Dung lượng pin (kWh)'],
  ['powertrain.fastChargingTime', 'Thời gian sạc nhanh'],
  ['powertrain.maxACCharging', 'Công suất sạc AC'],
  ['powertrain.maxDCCharging', 'Công suất sạc DC'],
  ['powertrain.steering', 'Trợ lực lái'],
  ['powertrain.frontSuspension', 'Hệ thống treo trước'],
  ['powertrain.rearSuspension', 'Hệ thống treo sau'],
  ['interior.numberOfSeats', 'Số chỗ ngồi'],
  ['interior.informationCenter', 'Màn hình thông tin'],
  ['interior.audioSystem', 'Hệ thống âm thanh'],
  ['interior.airConditioner', 'Điều hòa'],
  ['interior.driverSeatAdjustment', 'Ghế lái'],
  ['interior.upholstery', 'Chất liệu ghế'],
  ['interior.isofix', 'Móc ghế trẻ em ISOFIX'],
  ['interior.wirelessCharger', 'Sạc không dây'],
  ['exterior.auto', 'Đèn chiếu sáng phía trước'],
  ['exterior.lazang', 'Kích thước la-zăng'],
  ['safety.airbagSystem', 'Túi khí'],
  ['safety.abs', 'Chống bó cứng phanh (ABS)'],
  ['safety.ebd', 'Phân phối lực phanh điện tử (EBD)'],
  ['safety.tcs', 'Kiểm soát lực kéo (TCS)'],
  ['safety.esc', 'Cân bằng điện tử (ESC)'],
  ['safety.frontBrake', 'Phanh trước'],
  ['safety.rearBrake', 'Phanh sau'],
  ['safety.tpms', 'Giám sát áp suất lốp'],
  ['safety.360Camera', 'Camera 360°'],
  ['safety.reverseCamera', 'Camera lùi'],
  ['adas.cruiseControl', 'Kiểm soát hành trình'],
  ['adas.blindSpotWarning', 'Cảnh báo điểm mù'],
  ['adas.forwardCollisionWarning', 'Cảnh báo va chạm phía trước'],
  ['adas.frontEmergencyAutoBraking', 'Phanh khẩn cấp tự động phía trước'],
]

const HIDDEN_SPECIFICATION_KEYS = new Set(['url', 'name', 'product_type'])

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
}

function valueAtPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => asRecord(current)?.[key], value)
}

function normalized(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLocaleLowerCase('vi-VN')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanText(value: string): string | null {
  const text = value.replace(/<br\s*\/?>/gi, ' · ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  return text || null
}

function displayValue(value: unknown): string | null {
  if (typeof value === 'string') return cleanText(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    const values = value.map(displayValue).filter((item): item is string => Boolean(item))
    return values.length ? values.join(', ') : null
  }
  if (value && typeof value === 'object') {
    const values = Object.entries(value)
      .map(([key, item]) => {
        const displayed = displayValue(item)
        return displayed ? `${key}: ${displayed}` : null
      })
      .filter((item): item is string => Boolean(item))
    return values.length ? values.join('; ') : null
  }
  return null
}

function selectCarDetail(value: unknown) {
  const root = asRecord(value)
  const editions = asRecord(root?.specs)
  const entries = editions ? Object.entries(editions) : []
  const preferredNames = ['Eco', 'Comfort', 'Tiêu chuẩn', 'Phiên bản Tiêu chuẩn', 'Plus']
  const selected = preferredNames
    .map((name) => entries.find(([edition]) => normalized(edition) === normalized(name)))
    .find((entry) => entry !== undefined) ?? entries[0]
  const wrapper = asRecord(selected?.[1])
  return {
    root,
    edition: selected?.[0] ?? null,
    detail: asRecord(wrapper?.specs) ?? wrapper,
  }
}

function exactFingerprint(value: unknown, expected: string[]) {
  const record = asRecord(value)
  if (!record) return false
  const actual = Object.keys(record).map(normalized).sort()
  const target = expected.map(normalized).sort()
  return actual.length === target.length && actual.every((key, index) => key === target[index])
}

function unsupportedSchema(productType: VehicleProductType, keys: string[]): VehicleSpecNormalizationWarning {
  return {
    code: 'UNSUPPORTED_SPEC_SCHEMA',
    message: `Không thể chuẩn hóa thông số ${productType}: fingerprint không được hỗ trợ (${keys.join(', ')}).`,
  }
}

function carSchema(value: unknown): 'fastlane_car_v1' | 'fastlane_car_v2' | VehicleSpecNormalizationWarning {
  const { detail } = selectCarDetail(value)
  if (exactFingerprint(detail, CAR_STANDARD_SCHEMA)) return 'fastlane_car_v1'
  if (exactFingerprint(detail, CAR_NEW_SCHEMA)) return 'fastlane_car_v2'
  return unsupportedSchema('CAR', detail ? Object.keys(detail) : [])
}

function bikeSchema(value: unknown): 'fastlane_bike_v1' | 'fastlane_bike_v2' | VehicleSpecNormalizationWarning {
  const root = asRecord(value)
  const detail = asRecord(root?.specs) ?? root
  if (exactFingerprint(detail, BIKE_STANDARD_SCHEMA)) return 'fastlane_bike_v1'
  if (exactFingerprint(detail, BIKE_ALTERNATE_SCHEMA)) return 'fastlane_bike_v2'
  return unsupportedSchema('BIKE', detail ? Object.keys(detail) : [])
}

function parseLocalizedNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^-?\d+(?:[.,]\d+)?(?:\s*(?:km\/h|km|kw|w|nm|kwh|chỗ|ghế))?(?:\s*\([^)]*\))?$/i)
  if (!match) return null
  const number = Number(match[0].replace(/\s*(?:km\/h|km|kw|w|nm|kwh|chỗ|ghế).*$/i, '').replace(',', '.'))
  return Number.isFinite(number) ? number : null
}

function canonicalValue(key: VehicleSpecKey, rawValue: unknown, unit?: string): number | string | null {
  const displayed = displayValue(rawValue)
  if (!displayed) return null
  const number = parseLocalizedNumber(rawValue)
  if (number === null) return displayed
  if (key === 'max_power_kw' && /\bw\b/i.test(displayed) && !/\bkw\b/i.test(displayed)) return number / 1_000
  return number
}

function comparable(key: VehicleSpecKey, value: number | string | null) {
  if (value === null) return false
  return typeof value === 'number' || key === 'dimensions_mm' || key === 'charging_time' || key === 'drive_type'
}

export function normalizeVehicleSpecFacts(
  productType: VehicleProductType,
  value: unknown,
  updatedAt: string,
): Partial<Record<VehicleSpecKey, NormalizedVehicleSpec>> {
  return normalizeVehicleSpecFactsWithDiagnostics(productType, value, updatedAt).facts
}

export function normalizeVehicleSpecFactsWithDiagnostics(
  productType: VehicleProductType,
  value: unknown,
  updatedAt: string,
): VehicleSpecNormalizationResult {
  const definitions = productType === 'CAR' ? CAR_SPECIFICATIONS : BIKE_SPECIFICATIONS
  const schema = productType === 'CAR' ? carSchema(value) : bikeSchema(value)
  if (typeof schema !== 'string') return { facts: {}, warnings: [schema] }
  const facts: Partial<Record<VehicleSpecKey, NormalizedVehicleSpec>> = {}

  if (productType === 'CAR') {
    const { root, detail } = selectCarDetail(value)
    for (const definition of definitions) {
      let rawValue = definition.path && detail ? valueAtPath(detail, definition.path) : undefined
      let sourcePath = definition.path ? `specs.*.specs.${definition.path}` : ''
      if ((rawValue === null || rawValue === undefined || rawValue === '') && definition.key === 'range_km') {
        rawValue = root?.range_text ?? root?.range_km
        sourcePath = root?.range_text ? 'range_text' : 'range_km'
      }
      if ((rawValue === null || rawValue === undefined || rawValue === '') && definition.key === 'seats') {
        rawValue = root?.seat_count
        sourcePath = 'seat_count'
      }
      const displayed = displayValue(rawValue)
      if (!displayed) continue
      const normalizedValue = canonicalValue(definition.key, rawValue, definition.unit)
      facts[definition.key] = {
        key: definition.key,
        label: definition.label,
        value: normalizedValue,
        unit: definition.unit,
        displayValue: displayed,
        rawValue,
        sourcePath,
        sourceSchema: schema,
        updatedAt,
        comparable: comparable(definition.key, normalizedValue),
      }
    }
    return { facts, warnings: [] }
  }

  const root = asRecord(value)
  const bikeSpecs = asRecord(root?.specs) ?? root ?? {}
  const entries = Object.entries(bikeSpecs)
  for (const definition of definitions) {
    const aliases = definition.aliases ?? []
    const matched = entries.find(([label]) => aliases.includes(normalized(label)))
    if (!matched) continue
    const displayed = displayValue(matched[1])
    if (!displayed) continue
    const normalizedValue = canonicalValue(definition.key, matched[1], definition.unit)
    facts[definition.key] = {
      key: definition.key,
      label: definition.label,
      value: normalizedValue,
      unit: definition.unit,
      displayValue: displayed,
      rawValue: matched[1],
      sourcePath: `specs.${matched[0]}`,
      sourceSchema: schema,
      updatedAt,
      comparable: comparable(definition.key, normalizedValue),
    }
  }
  return { facts, warnings: [] }
}

export function normalizeCarSpecifications(value: unknown): Record<string, string> {
  const { root, edition, detail } = selectCarDetail(value)
  const result: Record<string, string> = {}
  if (edition) result['Phiên bản thông số'] = edition
  if (detail) {
    for (const [path, label] of COMPARE_CAR_FIELDS) {
      const displayed = displayValue(valueAtPath(detail, path))
      if (displayed) result[label] = displayed
    }
  }
  const range = displayValue(root?.range_text ?? root?.range_km)
  const seats = displayValue(root?.seat_count)
  if (!result['Quãng đường di chuyển'] && range) result['Quãng đường di chuyển'] = range
  if (!result['Số chỗ ngồi'] && seats) result['Số chỗ ngồi'] = seats
  return result
}

export function normalizeMotorbikeSpecifications(value: unknown): Record<string, string> {
  const root = asRecord(value)
  const specs = asRecord(root?.specs) ?? root
  if (!specs) return {}
  return Object.fromEntries(
    Object.entries(specs)
      .filter(([key]) => !key.startsWith('_') && !HIDDEN_SPECIFICATION_KEYS.has(key))
      .map(([key, item]) => [key, displayValue(item)] as const)
      .filter((entry): entry is readonly [string, string] => entry[1] !== null),
  )
}
