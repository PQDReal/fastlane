import { ApiRouteError } from '@/lib/api/errors'
import type {
  AddCartItemRequest,
  CheckoutRequest,
  ShippingAddress,
  UpdateCartItemRequest,
} from '@/lib/cart/types'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MONEY_PATTERN = /^(0|[1-9][0-9]*)$/
const PHONE_PATTERN = /^\+?[0-9]{9,15}$/
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{8,255}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validationError(path: string, message: string): never {
  throw new ApiRouteError(400, 'VALIDATION_ERROR', message, [
    { path, code: 'INVALID_FORMAT' },
  ])
}

export function parseAddCartItemRequest(body: unknown): AddCartItemRequest {
  if (!isRecord(body)) validationError('$', 'Request body must be an object.')

  const variantId = body.variantId
  const quantity = body.quantity
  const selected = body.selectedOptionValueIds

  if (typeof variantId !== 'string' || !UUID_PATTERN.test(variantId)) {
    validationError('variantId', 'variantId must be a UUID.')
  }
  if (!Number.isInteger(quantity) || Number(quantity) < 1 || Number(quantity) > 99) {
    validationError('quantity', 'quantity must be an integer from 1 to 99.')
  }
  if (
    selected !== undefined
    && (!Array.isArray(selected) || selected.some((item) => typeof item !== 'string'))
  ) {
    validationError(
      'selectedOptionValueIds',
      'selectedOptionValueIds must be an array.',
    )
  }
  if (Array.isArray(selected) && selected.length > 0) {
    throw new ApiRouteError(
      422,
      'OPTION_SELECTION_INVALID',
      'Options are derived from variantId and must not be submitted separately.',
    )
  }

  return {
    variantId,
    quantity: Number(quantity),
  }
}

export function parseUpdateCartItemRequest(
  body: unknown,
): UpdateCartItemRequest {
  if (!isRecord(body)) validationError('$', 'Request body must be an object.')
  if (!Number.isInteger(body.quantity) || Number(body.quantity) < 1 || Number(body.quantity) > 99) {
    validationError('quantity', 'quantity must be an integer from 1 to 99.')
  }

  return { quantity: Number(body.quantity) }
}

export function parseItemId(itemId: string) {
  if (!UUID_PATTERN.test(itemId)) {
    validationError('itemId', 'itemId must be a UUID.')
  }
  return itemId
}

function cleanRequiredString(
  value: unknown,
  path: string,
  maxLength: number,
) {
  if (typeof value !== 'string') validationError(path, `${path} is required.`)
  const cleaned = value.trim()
  if (!cleaned || cleaned.length > maxLength) {
    validationError(path, `${path} has an invalid length.`)
  }
  return cleaned
}

function parseShippingAddress(value: unknown): ShippingAddress {
  if (!isRecord(value)) {
    validationError('shippingAddress', 'shippingAddress must be an object.')
  }
  if (!isRecord(value.communeLevel)) {
    validationError(
      'shippingAddress.communeLevel',
      'communeLevel must be an object.',
    )
  }
  if (!isRecord(value.province)) {
    validationError(
      'shippingAddress.province',
      'province must be an object.',
    )
  }

  const phoneNumber = cleanRequiredString(
    value.phoneNumber,
    'shippingAddress.phoneNumber',
    16,
  ).replace(/[\s()-]/g, '')
  if (!PHONE_PATTERN.test(phoneNumber)) {
    validationError(
      'shippingAddress.phoneNumber',
      'phoneNumber must contain 9 to 15 digits.',
    )
  }

  const communeType = value.communeLevel.type
  if (!['COMMUNE', 'WARD', 'SPECIAL_ZONE'].includes(String(communeType))) {
    validationError(
      'shippingAddress.communeLevel.type',
      'communeLevel.type is invalid.',
    )
  }
  if (value.countryCode !== 'VN') {
    validationError(
      'shippingAddress.countryCode',
      'countryCode must be VN.',
    )
  }

  const line2 =
    typeof value.line2 === 'string' && value.line2.trim()
      ? value.line2.trim().slice(0, 255)
      : undefined
  const communeCode =
    typeof value.communeLevel.code === 'string' && value.communeLevel.code.trim()
      ? value.communeLevel.code.trim().slice(0, 20)
      : undefined
  const provinceCode =
    typeof value.province.code === 'string' && value.province.code.trim()
      ? value.province.code.trim().slice(0, 20)
      : undefined

  return {
    recipientName: cleanRequiredString(
      value.recipientName,
      'shippingAddress.recipientName',
      120,
    ),
    phoneNumber,
    line1: cleanRequiredString(
      value.line1,
      'shippingAddress.line1',
      255,
    ),
    ...(line2 ? { line2 } : {}),
    communeLevel: {
      ...(communeCode ? { code: communeCode } : {}),
      name: cleanRequiredString(
        value.communeLevel.name,
        'shippingAddress.communeLevel.name',
        120,
      ),
      type: communeType as ShippingAddress['communeLevel']['type'],
    },
    province: {
      ...(provinceCode ? { code: provinceCode } : {}),
      name: cleanRequiredString(
        value.province.name,
        'shippingAddress.province.name',
        120,
      ),
    },
    countryCode: 'VN',
  }
}

export function parseCheckoutRequest(body: unknown): CheckoutRequest {
  if (!isRecord(body)) validationError('$', 'Request body must be an object.')
  if (
    !Array.isArray(body.cartItemIds) ||
    body.cartItemIds.length < 1 ||
    body.cartItemIds.length > 100 ||
    body.cartItemIds.some(
      (item) => typeof item !== 'string' || !UUID_PATTERN.test(item),
    ) ||
    new Set(body.cartItemIds).size !== body.cartItemIds.length
  ) {
    validationError(
      'cartItemIds',
      'cartItemIds must contain 1 to 100 unique UUID values.',
    )
  }
  if (
    !Number.isSafeInteger(body.expectedCartVersion) ||
    Number(body.expectedCartVersion) < 0
  ) {
    validationError(
      'expectedCartVersion',
      'expectedCartVersion must be a non-negative integer.',
    )
  }
  if (
    typeof body.acceptedGrandTotal !== 'string' ||
    !MONEY_PATTERN.test(body.acceptedGrandTotal)
  ) {
    validationError(
      'acceptedGrandTotal',
      'acceptedGrandTotal must be a whole-VND string.',
    )
  }
  if (
    typeof body.acceptedAmountDueNow !== 'string' ||
    !MONEY_PATTERN.test(body.acceptedAmountDueNow)
  ) {
    validationError(
      'acceptedAmountDueNow',
      'acceptedAmountDueNow must be a whole-VND string.',
    )
  }

  const note =
    typeof body.note === 'string' && body.note.trim()
      ? body.note.trim().slice(0, 500)
      : undefined
  const promotionCode =
    typeof body.promotionCode === 'string' && body.promotionCode.trim()
      ? body.promotionCode.trim().toUpperCase()
      : undefined
  if (promotionCode !== undefined && !/^[A-Z0-9_-]{3,64}$/.test(promotionCode)) {
    validationError(
      'promotionCode',
      'promotionCode must contain 3 to 64 letters, numbers, hyphens, or underscores.',
    )
  }

  return {
    cartItemIds: [...(body.cartItemIds as string[])].sort(),
    expectedCartVersion: Number(body.expectedCartVersion),
    acceptedGrandTotal: body.acceptedGrandTotal,
    acceptedAmountDueNow: body.acceptedAmountDueNow,
    ...(promotionCode ? { promotionCode } : {}),
    shippingAddress: parseShippingAddress(body.shippingAddress),
    ...(note ? { note } : {}),
  }
}

export function parseIdempotencyKey(value: string | null) {
  if (!value || !IDEMPOTENCY_PATTERN.test(value)) {
    validationError(
      'Idempotency-Key',
      'Idempotency-Key must contain 8 to 255 safe characters.',
    )
  }
  return value
}
