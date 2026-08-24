import { normalizeProductSearchText } from '../catalog/search'
import type { CanonicalValue, SpecDefinition } from './types'

type ParseResult =
  | { ok: true; value: CanonicalValue }
  | { ok: false; reason: string }

const NUMBER_TOKEN = /[-+]?\d[\d.,\s]*\d|[-+]?\d/g

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

function detectedUnit(value: string) {
  const compact = value.toLowerCase().replace(/\s+/g, ' ')
  const match = compact.match(/(?:km\/h|kwh|kw|wh|nm|mph|km|mm|cm|\bw\b|\bm\b|giờ|gio|phút|phut|minute|minutes|hour|hours|chỗ|cho|ghế|ghe)/i)
  return match?.[0].toLowerCase() ?? null
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

  const baseUnitUsesWholeNumbers = unit === 'w' || unit === 'wh'
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
      return null
    case 'ENERGY':
      if (unit === 'wh') return value / 1_000
      if (unit === 'kwh') return value
      return null
    case 'DISTANCE':
      if (unit === 'm') return value / 1_000
      if (unit === 'km') return value
      return null
    case 'SPEED':
      if (unit === 'km/h') return value
      if (unit === 'mph') return value * 1.609344
      return null
    case 'TORQUE':
      return unit === 'nm' ? value : null
    case 'COUNT':
      return unit === null || ['chỗ', 'cho', 'ghế', 'ghe'].includes(unit) ? value : null
    case 'TIME':
      return null
  }
}

function durationSeconds(value: string) {
  const normalized = normalizeProductSearchText(value.split(/\s*\(/, 1)[0])
  if (/\d+(?:[.,]\d+)?\s*(?:-|den)\s*\d+(?:[.,]\d+)?\s*(?:h|gio|phut|p|minute|minutes|hour|hours)\b/.test(normalized)) return null
  const matches = [...normalized.matchAll(/(\d+(?:[.,]\d+)?)\s*(h|gio|phut|p|minute|minutes|hour|hours)\b/g)]
  if (matches.length === 0 || matches.length > 2) return null
  if (matches.length === 2) {
    const units = matches.map((match) => /^(h|gio|hour|hours)$/.test(match[2]) ? 'HOUR' : 'MINUTE')
    if (units[0] !== 'HOUR' || units[1] !== 'MINUTE') return null
  }
  return matches.reduce((total, match) => {
    const amount = Number(match[1].replace(',', '.'))
    if (!Number.isFinite(amount)) return Number.NaN
    return total + amount * (/^(h|gio|hour|hours)$/.test(match[2]) ? 3_600 : 60)
  }, 0)
}

export function parseCanonicalValue(
  rawValue: unknown,
  definition: SpecDefinition,
  options: { allowImplicitCanonicalUnit?: boolean } = {},
): ParseResult {
  const displayValue = displayText(rawValue)
  if (!displayValue) return { ok: false, reason: 'Giá trị trống hoặc không phải scalar.' }

  if (definition.valueType === 'TEXT') {
    return {
      ok: true,
      value: { valueType: 'TEXT', displayValue, numericValue: null, textValue: displayValue, booleanValue: null, durationSeconds: null, canonicalUnit: definition.canonicalUnit ?? null },
    }
  }

  if (definition.valueType === 'BOOLEAN') {
    const normalized = normalizeProductSearchText(displayValue)
    const truthy = ['true', 'yes', 'co'].includes(normalized)
    const falsy = ['false', 'no', 'khong'].includes(normalized)
    if (!truthy && !falsy) return { ok: false, reason: 'Giá trị boolean không hợp lệ.' }
    return {
      ok: true,
      value: { valueType: 'BOOLEAN', displayValue, numericValue: null, textValue: null, booleanValue: truthy, durationSeconds: null, canonicalUnit: null },
    }
  }

  if (definition.valueType === 'DURATION') {
    const seconds = durationSeconds(displayValue)
    if (seconds === null || !Number.isFinite(seconds)) return { ok: false, reason: 'Không thể chuẩn hóa thời lượng một cách chắc chắn.' }
    return {
      ok: true,
      value: { valueType: 'DURATION', displayValue, numericValue: null, textValue: null, booleanValue: null, durationSeconds: seconds, canonicalUnit: definition.canonicalUnit ?? 'second' },
    }
  }

  // Parenthetical text is treated as an explicit qualifier. It is preserved
  // for display/provenance but cannot change the primary typed measurement.
  const measurementSubject = displayValue.split(/\s*\(/, 1)[0].trim()
  const tokens = measurementSubject.match(NUMBER_TOKEN)?.map((token) => token.trim()).filter(Boolean) ?? []
  if (tokens.length !== 1) return { ok: false, reason: 'Giá trị số phải chứa chính xác một đại lượng.' }
  const unit = detectedUnit(measurementSubject)
  const parsed = parseNumberToken(tokens[0], unit)
  const converted = unit === null && (typeof rawValue === 'number' || options.allowImplicitCanonicalUnit === true)
    ? parsed
    : convertNumber(parsed, unit, definition)
  if (converted === null || !Number.isFinite(converted)) return { ok: false, reason: 'Đơn vị không tương thích với định nghĩa canonical.' }

  return {
    ok: true,
    value: { valueType: 'NUMBER', displayValue, numericValue: converted, textValue: null, booleanValue: null, durationSeconds: null, canonicalUnit: definition.canonicalUnit ?? null },
  }
}
