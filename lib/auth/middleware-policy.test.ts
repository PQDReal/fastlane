import { describe, expect, it } from 'vitest'

import {
  isCartMutationRequest,
  requiresLocalUserValidation,
} from './middleware-policy'

describe('requiresLocalUserValidation', () => {
  it.each([
    '/admin',
    '/admin/products',
    '/checkout',
    '/checkout/success',
    '/deposit',
    '/profile',
  ])('validates authenticated users on protected page %s', (pathname) => {
    expect(requiresLocalUserValidation(pathname)).toBe(true)
  })

  it.each([
    '/',
    '/bikes',
    '/bikes/amio',
    '/cars',
    '/accessories',
    '/compare',
    '/cost-estimator',
    '/api/v1/products',
  ])('does not query the local user database on public route %s', (pathname) => {
    expect(requiresLocalUserValidation(pathname)).toBe(false)
  })
})

describe('isCartMutationRequest', () => {
  it.each([
    ['POST', '/api/v1/cart/items'],
    ['PATCH', '/api/v1/cart/items/variant-1'],
    ['DELETE', '/api/v1/cart/items/variant-1'],
  ])('matches %s %s', (method, pathname) => {
    expect(isCartMutationRequest(pathname, method)).toBe(true)
  })

  it.each([
    ['GET', '/api/v1/cart'],
    ['GET', '/api/v1/cart/items'],
    ['OPTIONS', '/api/v1/cart/items'],
    ['POST', '/api/v1/cart/promotion'],
  ])('does not match %s %s', (method, pathname) => {
    expect(isCartMutationRequest(pathname, method)).toBe(false)
  })
})
