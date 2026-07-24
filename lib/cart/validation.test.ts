import { describe, expect, it } from 'vitest'

import { ApiRouteError } from '@/lib/api/errors'
import {
  parseAddCartItemRequest,
  parseCheckoutRequest,
  parseIdempotencyKey,
  parseUpdateCartItemRequest,
} from '@/lib/cart/validation'

const variantId = '123e4567-e89b-12d3-a456-426614174002'

describe('cart request validation', () => {
  it('accepts a valid accessory cart item', () => {
    expect(
      parseAddCartItemRequest({
        variantId,
        selectedOptionValueIds: [],
        quantity: 2,
      }),
    ).toEqual({ variantId, selectedOptionValueIds: [], quantity: 2 })
  })

  it('accepts UUID values already stored by PostgreSQL without RFC version bits', () => {
    const databaseVariantId = 'c1c10039-366f-d387-9858-2e4533013802'
    expect(
      parseAddCartItemRequest({
        variantId: databaseVariantId,
        selectedOptionValueIds: [],
        quantity: 1,
      }),
    ).toMatchObject({ variantId: databaseVariantId })
  })

  it('rejects unsupported accessory options', () => {
    expect(() =>
      parseAddCartItemRequest({
        variantId,
        selectedOptionValueIds: [variantId],
        quantity: 1,
      }),
    ).toThrowError(ApiRouteError)

    try {
      parseAddCartItemRequest({
        variantId,
        selectedOptionValueIds: [variantId],
        quantity: 1,
      })
    } catch (error) {
      expect(error).toMatchObject({
        status: 422,
        code: 'OPTION_SELECTION_INVALID',
      })
    }
  })

  it('enforces quantity boundaries', () => {
    for (const quantity of [0, 100, 1.5]) {
      expect(() => parseUpdateCartItemRequest({ quantity })).toThrowError(
        ApiRouteError,
      )
    }
  })
})

describe('checkout request validation', () => {
  const validRequest = {
    cartItemIds: [variantId],
    expectedCartVersion: 1721710000000,
    acceptedGrandTotal: '2074000',
    acceptedAmountDueNow: '2074000',
    shippingAddress: {
      recipientName: ' Nguyễn Văn A ',
      phoneNumber: '0901234567',
      line1: '1 Nguyễn Huệ',
      communeLevel: { name: 'Bến Nghé', type: 'WARD' },
      province: { name: 'Hồ Chí Minh' },
      countryCode: 'VN',
    },
  }

  it('normalizes a valid checkout request', () => {
    const result = parseCheckoutRequest(validRequest)
    expect(result.shippingAddress.recipientName).toBe('Nguyễn Văn A')
    expect(result.shippingAddress.phoneNumber).toBe('0901234567')
    expect(result.acceptedGrandTotal).toBe('2074000')
  })

  it('rejects decimal or numeric money values', () => {
    expect(() =>
      parseCheckoutRequest({ ...validRequest, acceptedGrandTotal: 2074000 }),
    ).toThrowError(ApiRouteError)
    expect(() =>
      parseCheckoutRequest({ ...validRequest, acceptedGrandTotal: '20.5' }),
    ).toThrowError(ApiRouteError)
  })

  it('requires one or more unique selected cart item IDs', () => {
    expect(() =>
      parseCheckoutRequest({ ...validRequest, cartItemIds: [] }),
    ).toThrowError(ApiRouteError)
    expect(() =>
      parseCheckoutRequest({
        ...validRequest,
        cartItemIds: [variantId, variantId],
      }),
    ).toThrowError(ApiRouteError)
    expect(() =>
      parseCheckoutRequest({ ...validRequest, cartItemIds: ['not-a-uuid'] }),
    ).toThrowError(ApiRouteError)
  })

  it('rejects invalid phone numbers and country codes', () => {
    expect(() =>
      parseCheckoutRequest({
        ...validRequest,
        shippingAddress: {
          ...validRequest.shippingAddress,
          phoneNumber: 'abc',
        },
      }),
    ).toThrowError(ApiRouteError)
    expect(() =>
      parseCheckoutRequest({
        ...validRequest,
        shippingAddress: {
          ...validRequest.shippingAddress,
          countryCode: 'US',
        },
      }),
    ).toThrowError(ApiRouteError)
  })

  it('validates idempotency keys', () => {
    expect(parseIdempotencyKey('checkout:12345678')).toBe('checkout:12345678')
    expect(() => parseIdempotencyKey('short')).toThrowError(ApiRouteError)
    expect(() => parseIdempotencyKey('invalid key with spaces')).toThrowError(
      ApiRouteError,
    )
  })
})
