type MeasurementValue = {
  valueText?: string | null
  valueNumeric?: number | string | null
  unit?: string | null
}

type UnitDefinition = {
  label: string
  aliases: string[]
  compact?: boolean
}

const UNIT_DEFINITIONS: Record<string, UnitDefinition> = {
  year: {
    label: 'năm',
    aliases: ['year', 'years', 'yr', 'yrs', 'năm'],
  },
  month: {
    label: 'tháng',
    aliases: ['month', 'months', 'tháng'],
  },
  day: {
    label: 'ngày',
    aliases: ['day', 'days', 'ngày'],
  },
  minute: {
    label: 'phút',
    aliases: ['minute', 'minutes', 'min', 'mins', 'phút'],
  },
  km: {
    label: 'km',
    aliases: ['km', 'kilometer', 'kilometers', 'kilometre', 'kilometres'],
  },
  percent: {
    label: '%',
    aliases: ['percent', 'percentage', 'phần trăm', '%'],
    compact: true,
  },
}

function normalizeForUnitCheck(value: string): string {
  return value
    .normalize('NFC')
    .toLocaleLowerCase('vi-VN')
    .replace(/(\d)(\p{L})/gu, '$1 $2')
    .replace(/(\p{L})(\d)/gu, '$1 $2')
    .replace(/[^\p{L}\p{N}%]+/gu, ' ')
    .trim()
}

function resolveUnit(unit: string): UnitDefinition {
  const normalizedUnit = normalizeForUnitCheck(unit)
  const knownUnit = Object.entries(UNIT_DEFINITIONS).find(
    ([key, definition]) => key === normalizedUnit || definition.aliases.includes(normalizedUnit),
  )

  return knownUnit?.[1] ?? { label: unit.trim(), aliases: [normalizedUnit] }
}

function containsUnit(value: string, definition: UnitDefinition): boolean {
  const normalizedValue = ` ${normalizeForUnitCheck(value)} `

  return definition.aliases.some((alias) => {
    const normalizedAlias = normalizeForUnitCheck(alias)
    return normalizedAlias === '%' ? normalizedValue.includes('%') : normalizedValue.includes(` ${normalizedAlias} `)
  })
}

function formatNumericValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString('vi-VN') : ''

  const trimmed = value.trim()
  const numeric = Number(trimmed)
  return trimmed && Number.isFinite(numeric) ? numeric.toLocaleString('vi-VN') : trimmed
}

export function formatAfterSalesMeasurement({ valueText, valueNumeric, unit }: MeasurementValue): string {
  const explicitValue = valueText?.trim() ?? ''
  const value = explicitValue || formatNumericValue(valueNumeric)
  if (!value) return 'Chưa cập nhật'

  const normalizedUnit = unit?.trim() ?? ''
  if (!normalizedUnit) return value

  const definition = resolveUnit(normalizedUnit)
  if (containsUnit(value, definition)) return value

  return `${value}${definition.compact ? '' : ' '}${definition.label}`
}
