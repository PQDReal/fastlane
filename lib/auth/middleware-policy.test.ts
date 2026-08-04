import { describe, expect, it } from 'vitest'

import { requiresLocalUserValidation } from './middleware-policy'

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
