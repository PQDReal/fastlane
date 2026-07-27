import type { SelectedProductOption } from '@/lib/cart/types'

const moneyPattern = /^(0|[1-9]\d*)$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isSelectedProductOption(value: unknown): value is SelectedProductOption {
  return (
    isRecord(value) &&
    isNonEmptyString(value.groupId) &&
    isNonEmptyString(value.groupCode) &&
    isNonEmptyString(value.groupName) &&
    isNonEmptyString(value.valueId) &&
    isNonEmptyString(value.valueCode) &&
    isNonEmptyString(value.valueName) &&
    typeof value.priceAdjustment === 'string' &&
    moneyPattern.test(value.priceAdjustment)
  )
}

export function readSelectedOptionsSnapshot(
  value: unknown,
): SelectedProductOption[] {
  if (!Array.isArray(value) || !value.every(isSelectedProductOption)) {
    throw new Error('Order item contains an invalid selected-options snapshot.')
  }

  return value
}
