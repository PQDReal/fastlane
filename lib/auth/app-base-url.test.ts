import { describe, expect, it } from 'vitest'

import { resolveAppBaseUrl } from './app-base-url'

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

  it('fails early when no browser-facing URL can be resolved', () => {
    expect(() => resolveAppBaseUrl({ APP_BASE_URL: 'http://0.0.0.0:3000' }))
      .toThrow(/public http\(s\) URL/)
  })
})
