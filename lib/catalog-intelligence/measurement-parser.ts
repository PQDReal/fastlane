import { normalizeProductSearchText } from '../catalog/search'
import type {
  CanonicalFactCandidate,
  CanonicalValue,
  ComparisonOperator,
  FactQualifier,
  SpecDefinition,
} from './types'

type ParseResult =
  | { ok: true; value: CanonicalValue }
  | { ok: false; reason: string }

export type ParseFactsResult =
  | { ok: true; facts: CanonicalFactCandidate[] }
  | { ok: false; reason: string }

type ParseOptions = {
  allowImplicitCanonicalUnit?: boolean
  implicitUnit?: string
  qualifiers?: readonly FactQualifier[]
}

const NUMBER_TOKEN = /[-+]?\d[\d.,\s]*\d|[-+]?\d/g
const NUMBER_SOURCE = '[-+]?\\d+(?:[.,]\\d+)?'
const UNIT_SOURCE = 'km\\/h|kwh|kw|hp|ps|cv|wh|nm|mph|km|mm|cm|kg|gram|g|ml|l|\\bw\\b|\\bm\\b|inch|giờ|gio|phút|phut|minute|minutes|hour|hours|giây|giay|second|seconds|sec|\\bs\\b|chỗ|cho|ghế|ghe|túi|tui'

function normalizeMeasurementText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, (letter) => letter === 'Đ' ? 'D' : 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function displayText(value: unknown) {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value !== 'string') return null
  const cleaned = value
    .replace(/<br\s*\/?\s*>/gi, ' · ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || null
}

function parseNumberToken(token: string, unit: string | null) {
  const compact = token.replace(/\s+/g, '')
  const commaCount = (compact.match(/,/g) ?? []).length
  const dotCount = (compact.match(/\./g) ?? []).length

  if (commaCount > 0 && dotCount > 0) {
    const decimalSeparator = compact.lastIndexOf(',') > compact.lastIndexOf('.') ? ',' : '.'
    const groupingSeparator = decimalSeparator === ',' ? /\./g : /,/g
    return Number(compact.replace(groupingSeparator, '').replace(decimalSeparator, '.'))
  }

  const separator = commaCount ? ',' : dotCount ? '.' : null
  if (!separator) return Number(compact)
  const pieces = compact.split(separator)
  if (pieces.length > 2) {
    return pieces.slice(1).every((piece) => piece.length === 3)
      ? Number(pieces.join(''))
      : Number.NaN
  }

  const baseUnitUsesWholeNumbers = ['w', 'wh', 'mm', 'kg', 'gram', 'g'].includes(unit ?? '')
  const grouped = baseUnitUsesWholeNumbers && pieces[1]?.length === 3 && pieces[0]?.length <= 3
  return Number(grouped ? pieces.join('') : `${pieces[0]}.${pieces[1]}`)
}

function convertNumber(value: number, unit: string | null, definition: SpecDefinition) {
  if (!Number.isFinite(value)) return null
  if (!definition.unitDimension) return value

  switch (definition.unitDimension) {
    case 'POWER':
      if (unit === 'w') return value / 1_000
      if (unit === 'kw') return value
      if (unit === 'hp') return value * 0.745699872
      if (unit === 'ps' || unit === 'cv') return value * 0.73549875
      return null
    case 'ENERGY':
      if (unit === 'wh') return value / 1_000
      if (unit === 'kwh') return value
      return null
    case 'DISTANCE':
      if (unit === 'm') return value / 1_000
      if (unit === 'km') return value
      return null
    case 'LENGTH':
      if (unit === 'm') return value * 1_000
      if (unit === 'cm') return value * 10
      if (unit === 'mm') return value
      if (unit === 'inch') return value * 25.4
      return null
    case 'SPEED':
      if (unit === 'km/h') return value
      if (unit === 'mph') return value * 1.609344
      return null
    case 'TORQUE':
      return unit === 'nm' ? value : null
    case 'COUNT':
      return unit === null || ['count', 'chỗ', 'cho', 'ghế', 'ghe', 'túi', 'tui'].includes(unit) ? value : null
    case 'MASS':
      if (unit === 'kg') return value
      if (unit === 'g' || unit === 'gram') return value / 1_000
      return null
    case 'VOLUME':
      if (unit === 'l') return value
      if (unit === 'ml') return value / 1_000
      return null
    case 'TIME':
      return null
  }
}

function valueBase(displayValue: string, comparisonOperator: ComparisonOperator = 'EQ') {
  return {
    displayValue,
    comparisonOperator,
    numericUpperValue: null,
    numericTolerance: null,
  }
}

function numberValue(
  displayValue: string,
  definition: SpecDefinition,
  numericValue: number,
  comparisonOperator: ComparisonOperator = 'EQ',
  numericUpperValue: number | null = null,
  numericTolerance: number | null = null,
): CanonicalValue {
  return {
    valueType: 'NUMBER',
    ...valueBase(displayValue, comparisonOperator),
    numericValue,
    numericUpperValue,
    numericTolerance,
    textValue: null,
    booleanValue: null,
    durationSeconds: null,
    canonicalUnit: definition.canonicalUnit ?? null,
  }
}

function durationValue(displayValue: string, seconds: number, comparisonOperator: ComparisonOperator): CanonicalValue {
  return {
    valueType: 'DURATION',
    ...valueBase(displayValue, comparisonOperator),
    numericValue: null,
    textValue: null,
    booleanValue: null,
    durationSeconds: seconds,
    canonicalUnit: 'second',
  }
}

function qualifierKey(qualifier: FactQualifier) {
  return `${qualifier.key}\u001f${typeof qualifier.value}\u001f${String(qualifier.value)}\u001f${qualifier.unit ?? ''}`
}

function mergeQualifiers(...groups: ReadonlyArray<readonly FactQualifier[]>) {
  const byKey = new Map<string, FactQualifier>()
  for (const qualifier of groups.flat()) byKey.set(qualifier.key, { ...qualifier })
  return [...byKey.values()].sort((left, right) => qualifierKey(left).localeCompare(qualifierKey(right)))
}

export function canonicalContextKey(qualifiers: readonly FactQualifier[]) {
  if (qualifiers.length === 0) return 'default'
  return JSON.stringify(mergeQualifiers(qualifiers).map(({ key, value, unit }) => unit === undefined ? { key, value } : { key, value, unit }))
}

function fact(value: CanonicalValue, qualifiers: readonly FactQualifier[]): CanonicalFactCandidate {
  const normalizedQualifiers = mergeQualifiers(qualifiers)
  return { value, qualifiers: normalizedQualifiers, contextKey: canonicalContextKey(normalizedQualifiers) }
}

function qualifiersFromText(value: string) {
  const normalized = normalizeMeasurementText(value)
  const qualifiers: FactQualifier[] = []
  const cycle = normalized.match(/\b(nedc|wltp|epa)\b/)?.[1]
  if (cycle) qualifiers.push({ key: 'test_cycle', value: cycle.toUpperCase() })

  const batteryCount = normalized.match(/(?:khi\s+)?lap\s+(\d+)\s*pin\b/)?.[1]
  if (batteryCount) qualifiers.push({ key: 'battery_count', value: Number(batteryCount), unit: 'battery' })
  if (/pin phu/.test(normalized)) qualifiers.push({ key: 'auxiliary_battery_installed', value: true })
  if (/2 pin chay song song/.test(normalized)) qualifiers.push({ key: 'battery_connection', value: 'PARALLEL' })

  const chargerPower = normalized.match(/(?:sac|charger)\s*(\d+(?:[.,]\d+)?)\s*w\b/)?.[1]
  if (chargerPower) qualifiers.push({ key: 'charger_power_w', value: Number(chargerPower.replace(',', '.')), unit: 'W' })

  const soc = normalized.match(/(\d+(?:[.,]\d+)?)\s*%\s*(?:-|den)\s*(\d+(?:[.,]\d+)?)\s*%/)
  if (soc) {
    qualifiers.push({ key: 'soc_start_percent', value: Number(soc[1].replace(',', '.')), unit: '%' })
    qualifiers.push({ key: 'soc_end_percent', value: Number(soc[2].replace(',', '.')), unit: '%' })
  }

  const testLoad = normalized.match(/(\d+)\s*nguoi\s*(\d+(?:[.,]\d+)?)\s*kg/)
  if (testLoad) {
    qualifiers.push({ key: 'occupant_count', value: Number(testLoad[1]), unit: 'person' })
    qualifiers.push({ key: 'test_load_kg', value: Number(testLoad[2].replace(',', '.')), unit: 'kg' })
  }
  return qualifiers
}

function comparisonFromText(value: string): ComparisonOperator {
  const normalized = normalizeProductSearchText(value)
  if (/^\s*</.test(value)) return 'LT'
  if (/^\s*>/.test(value)) return 'GT'
  if (/\bkhoang\b|~/.test(normalized)) return 'APPROX'
  return 'EQ'
}

function durationSeconds(value: string) {
  const normalized = normalizeMeasurementText(value).replace(/(\d+(?:[.,]\d+)?)\s*h\s*(\d+)/g, '$1 h $2 ')
  const range = new RegExp(`(?:${NUMBER_SOURCE})\\s*(?:-|den)\\s*(?:${NUMBER_SOURCE})\\s*(?:h|gio|phut|p|minute|minutes|hour|hours|giay|second|seconds|sec|s)\\b`)
  if (range.test(normalized)) return null
  const matches = [...normalized.matchAll(/(\d+(?:[.,]\d+)?)\s*(h|gio|phut|p|minute|minutes|hour|hours|giay|second|seconds|sec|s)\b/g)]
  if (matches.length === 0 || matches.length > 2) return null
  if (matches.length === 2) {
    const units = matches.map((match) => /^(h|gio|hour|hours)$/.test(match[2]) ? 'HOUR' : /^(phut|p|minute|minutes)$/.test(match[2]) ? 'MINUTE' : 'SECOND')
    if (units[0] !== 'HOUR' || units[1] !== 'MINUTE') return null
  }
  return matches.reduce((total, match) => {
    const amount = Number(match[1].replace(',', '.'))
    if (!Number.isFinite(amount)) return Number.NaN
    if (/^(h|gio|hour|hours)$/.test(match[2])) return total + amount * 3_600
    if (/^(phut|p|minute|minutes)$/.test(match[2])) return total + amount * 60
    return total + amount
  }, 0)
}

function parseDurationFacts(displayValue: string, defaultQualifiers: readonly FactQualifier[]): ParseFactsResult {
  const segments = displayValue.split(/\s*;\s*/).filter(Boolean)
  const facts: CanonicalFactCandidate[] = []
  for (const segment of segments) {
    const seconds = durationSeconds(segment)
    if (seconds === null || !Number.isFinite(seconds)) return { ok: false, reason: 'Không thể chuẩn hóa thời lượng một cách chắc chắn.' }
    const contextual = qualifiersFromText(segment)
    const hasExplicitCharger = contextual.some((qualifier) => qualifier.key === 'charger_power_w')
    const defaults = segments.length > 1 && hasExplicitCharger
      ? defaultQualifiers.filter((qualifier) => qualifier.key !== 'charging_mode')
      : defaultQualifiers
    facts.push(fact(durationValue(segment, seconds, comparisonFromText(segment)), mergeQualifiers(defaults, contextual)))
  }
  return { ok: true, facts }
}

function explicitMeasurements(value: string, definition: SpecDefinition) {
  const matches: Array<{ converted: number }> = []
  const pattern = new RegExp(`(${NUMBER_SOURCE})\\s*(${UNIT_SOURCE})`, 'gi')
  for (const match of value.matchAll(pattern)) {
    const unit = match[2].toLowerCase()
    const amount = parseNumberToken(match[1], unit)
    const converted = convertNumber(amount, unit, definition)
    if (converted !== null && Number.isFinite(converted)) matches.push({ converted })
  }
  return matches
}

function parseNumberFacts(
  displayValue: string,
  definition: SpecDefinition,
  options: ParseOptions,
): ParseFactsResult {
  const defaults = options.qualifiers ?? []
  const contextual = qualifiersFromText(displayValue)
  const implicitUnit = options.implicitUnit
    ?? (options.allowImplicitCanonicalUnit ? definition.canonicalUnit : undefined)
    ?? null

  if (definition.unitDimension === 'ENERGY') {
    const multiplied = displayValue.match(new RegExp(`(${NUMBER_SOURCE})\\s*[x×]\\s*(${NUMBER_SOURCE})\\s*(kwh|wh)`, 'i'))
    if (multiplied) {
      const count = Number(multiplied[1].replace(',', '.'))
      const unit = multiplied[3].toLowerCase()
      const component = convertNumber(parseNumberToken(multiplied[2], unit), unit, definition)
      if (!Number.isInteger(count) || count < 1 || component === null) return { ok: false, reason: 'Cấu trúc dung lượng nhiều pin không hợp lệ.' }
      const qualifiers = mergeQualifiers(defaults, contextual, [
        { key: 'battery_count', value: count, unit: 'battery' },
        { key: 'battery_unit_capacity_kwh', value: component, unit: 'kWh' },
      ])
      return { ok: true, facts: [fact(numberValue(displayValue, definition, count * component), qualifiers)] }
    }
  }

  const tolerance = displayValue.match(new RegExp(`(${NUMBER_SOURCE})\\s*(?:±|\\+\\/-)\\s*(${NUMBER_SOURCE})\\s*(${UNIT_SOURCE})?`, 'i'))
  if (tolerance) {
    const unit = tolerance[3]?.toLowerCase() ?? implicitUnit
    const nominal = convertNumber(parseNumberToken(tolerance[1], unit), unit, definition)
    const amount = convertNumber(parseNumberToken(tolerance[2], unit), unit, definition)
    if (nominal === null || amount === null) return { ok: false, reason: 'Đơn vị dung sai không tương thích với định nghĩa canonical.' }
    return { ok: true, facts: [fact(numberValue(displayValue, definition, nominal, 'APPROX', null, amount), mergeQualifiers(defaults, contextual))] }
  }

  const interval = displayValue.match(new RegExp(`(${NUMBER_SOURCE})\\s*(?:-|–|—|~|đến|den)\\s*(${NUMBER_SOURCE})\\s*(${UNIT_SOURCE})`, 'i'))
  if (interval) {
    const unit = interval[3].toLowerCase()
    const lower = convertNumber(parseNumberToken(interval[1], unit), unit, definition)
    const upper = convertNumber(parseNumberToken(interval[2], unit), unit, definition)
    if (lower === null || upper === null || lower > upper) return { ok: false, reason: 'Khoảng giá trị không hợp lệ hoặc sai đơn vị.' }
    return { ok: true, facts: [fact(numberValue(displayValue, definition, lower, 'RANGE', upper), mergeQualifiers(defaults, contextual))] }
  }

  const measurements = explicitMeasurements(displayValue, definition)
  const additive = displayValue.match(new RegExp(`\\+\\s*(${NUMBER_SOURCE})\\s*(${UNIT_SOURCE})`, 'i'))
  if (additive && measurements.length >= 2) {
    const base = measurements[0].converted
    const extraUnit = additive[2].toLowerCase()
    const extra = convertNumber(parseNumberToken(additive[1], extraUnit), extraUnit, definition)
    if (extra === null) return { ok: false, reason: 'Đại lượng cộng thêm không tương thích với định nghĩa canonical.' }
    const common = mergeQualifiers(defaults, contextual.filter((qualifier) => qualifier.key !== 'auxiliary_battery_installed'))
    return {
      ok: true,
      facts: [
        fact(numberValue(displayValue, definition, base, comparisonFromText(displayValue)), mergeQualifiers(common, [{ key: 'auxiliary_battery_installed', value: false }])),
        fact(numberValue(displayValue, definition, base + extra, comparisonFromText(displayValue)), mergeQualifiers(common, [{ key: 'auxiliary_battery_installed', value: true }])),
      ],
    }
  }

  if (definition.unitDimension === 'ENERGY' && measurements.length === 2 && /tuy chon (?:lap|them)/.test(normalizeProductSearchText(displayValue))) {
    const common = mergeQualifiers(defaults, contextual.filter((qualifier) => qualifier.key !== 'auxiliary_battery_installed'))
    return {
      ok: true,
      facts: [
        fact(numberValue(displayValue, definition, measurements[0].converted, comparisonFromText(displayValue)), mergeQualifiers(common, [{ key: 'auxiliary_battery_installed', value: false }])),
        fact(numberValue(displayValue, definition, measurements[0].converted + measurements[1].converted, comparisonFromText(displayValue)), mergeQualifiers(common, [{ key: 'auxiliary_battery_installed', value: true }])),
      ],
    }
  }

  if (measurements.length === 2 && /\([^)]*\bkhi\b[^)]*\)/i.test(normalizeMeasurementText(displayValue))) {
    const common = mergeQualifiers(defaults, contextual.filter((qualifier) => qualifier.key !== 'auxiliary_battery_installed'))
    return {
      ok: true,
      facts: [
        fact(numberValue(displayValue, definition, measurements[0].converted, comparisonFromText(displayValue)), mergeQualifiers(common, [{ key: 'auxiliary_battery_installed', value: false }])),
        fact(numberValue(displayValue, definition, measurements[1].converted, comparisonFromText(displayValue)), mergeQualifiers(common, [{ key: 'auxiliary_battery_installed', value: true }])),
      ],
    }
  }

  if (measurements.length === 1) {
    return { ok: true, facts: [fact(numberValue(displayValue, definition, measurements[0].converted, comparisonFromText(displayValue)), mergeQualifiers(defaults, contextual))] }
  }
  if (measurements.length > 1) return { ok: false, reason: 'Giá trị số chứa nhiều đại lượng nhưng chưa có policy context phù hợp.' }

  const tokens = displayValue.match(NUMBER_TOKEN)?.map((token) => token.trim()).filter(Boolean) ?? []
  if (tokens.length !== 1 || implicitUnit === null) return { ok: false, reason: 'Giá trị số phải chứa chính xác một đại lượng có đơn vị xác định.' }
  const parsed = parseNumberToken(tokens[0], implicitUnit)
  const converted = convertNumber(parsed, implicitUnit, definition)
  if (converted === null || !Number.isFinite(converted)) return { ok: false, reason: 'Đơn vị ngầm định không tương thích với định nghĩa canonical.' }
  return { ok: true, facts: [fact(numberValue(displayValue, definition, converted, comparisonFromText(displayValue)), mergeQualifiers(defaults, contextual))] }
}

export function parseCanonicalFacts(
  rawValue: unknown,
  definition: SpecDefinition,
  options: ParseOptions = {},
): ParseFactsResult {
  const displayValue = displayText(rawValue)
  if (!displayValue) return { ok: false, reason: 'Giá trị trống hoặc không phải scalar.' }

  if (definition.valueType === 'TEXT') {
    const value: CanonicalValue = {
      valueType: 'TEXT',
      ...valueBase(displayValue),
      numericValue: null,
      textValue: displayValue,
      booleanValue: null,
      durationSeconds: null,
      canonicalUnit: definition.canonicalUnit ?? null,
    }
    return { ok: true, facts: [fact(value, options.qualifiers ?? [])] }
  }

  if (definition.valueType === 'BOOLEAN') {
    const normalized = normalizeProductSearchText(displayValue)
    const truthy = ['true', 'yes', 'co'].includes(normalized)
    const falsy = ['false', 'no', 'khong'].includes(normalized)
    if (!truthy && !falsy) return { ok: false, reason: 'Giá trị boolean không hợp lệ.' }
    const value: CanonicalValue = {
      valueType: 'BOOLEAN',
      ...valueBase(displayValue),
      numericValue: null,
      textValue: null,
      booleanValue: truthy,
      durationSeconds: null,
      canonicalUnit: null,
    }
    return { ok: true, facts: [fact(value, options.qualifiers ?? [])] }
  }

  if (definition.valueType === 'DURATION') return parseDurationFacts(displayValue, options.qualifiers ?? [])
  return parseNumberFacts(displayValue, definition, options)
}

export function parseCanonicalValue(
  rawValue: unknown,
  definition: SpecDefinition,
  options: ParseOptions = {},
): ParseResult {
  const parsed = parseCanonicalFacts(rawValue, definition, options)
  if (!parsed.ok) return parsed
  if (parsed.facts.length !== 1) return { ok: false, reason: 'Giá trị tạo ra nhiều fact có context; hãy dùng parseCanonicalFacts().' }
  return { ok: true, value: parsed.facts[0].value }
}
