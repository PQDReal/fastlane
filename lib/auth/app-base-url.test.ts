import { describe, expect, it } from 'vitest'

import { resolveAppBaseUrl, toPublicAppUrl } from './app-base-url'

describe('resolveAppBaseUrl', () => {
  it('uses an explicitly configured public URL', () => {
    expect(resolveAppBaseUrl({
      APP_BASE_URL: 'https://fastlane.example.com/path',
      RAILWAY_PUBLIC_DOMAIN: 'fallback.up.railway.app',
    })).toBe('https://fastlane.example.com')
  })

  it('replaces a wildcard container address with the Railway public domain', () => {
    expect(resolveAppBaseUrl({
      APP_BASE_URL: 'https://0.0.0.0:8080',
      RAILWAY_PUBLIC_DOMAIN: 'fastlane-production.up.railway.app',
    })).toBe('https://fastlane-production.up.railway.app')
  })

  it('keeps localhost available for local development', () => {
    expect(resolveAppBaseUrl({ APP_BASE_URL: 'http://localhost:3000' }))
      .toBe('http://localhost:3000')
  })

  it('defers resolution when build-time variables are unavailable', () => {
    expect(resolveAppBaseUrl({ APP_BASE_URL: 'http://0.0.0.0:3000' }))
      .toBeUndefined()
  })
})

describe('toPublicAppUrl', () => {
  it('replaces Railway container origin while preserving the route', () => {
    expect(toPublicAppUrl(
      'https://0.0.0.0:8080/auth/logout?returnTo=https%3A%2F%2F0.0.0.0%3A8080%2F',
      { APP_BASE_URL: 'https://fastlane-production-5409.up.railway.app/' },
    ).toString()).toBe(
      'https://fastlane-production-5409.up.railway.app/auth/logout?returnTo=https%3A%2F%2Ffastlane-production-5409.up.railway.app',
    )
  })

  it('keeps the request URL when no public origin is available', () => {
    expect(toPublicAppUrl('http://localhost:3000/cart', {}).toString())
      .toBe('http://localhost:3000/cart')
  })
})
