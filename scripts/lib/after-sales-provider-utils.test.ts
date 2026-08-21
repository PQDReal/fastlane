// @ts-nocheck
import { describe, expect, it, vi } from 'vitest'

import {
  browserbaseQuotaCircuitOpen,
  classifyProviderError,
  executeProvider,
  findLocalBrowserExecutable,
  isVerifiedSnapshot,
  providerCooldownOpen,
  providerQuotaCircuitOpen,
  sanitizeProviderErrorMessage,
  selectLatestVerifiedSnapshot,
  shouldRetainPreviousSnapshot,
} from './after-sales-provider-utils.mjs'
import {
  buildBrowserlessCdpUrl,
  providerOrderForSource,
  validateBrowserlessCapture,
} from './after-sales-browserless-provider.mjs'
import {
  buildBrightDataCdpUrl,
  validateBrightDataCapture,
} from './after-sales-brightdata-provider.mjs'

describe('after-sales acquisition provider guarantees', () => {
  it.each([
    [Object.assign(new Error('Unexpected server response: 401'), { status: 401 }), 'AUTH_FAILED', false],
    [Object.assign(new Error('HTTP 402 quota'), { status: 402 }), 'QUOTA_EXHAUSTED', false],
    [Object.assign(new Error('HTTP 429'), { status: 429 }), 'RATE_LIMITED', true],
    [Object.assign(new Error('HTTP 503'), { status: 503 }), 'PROVIDER_ERROR', true],
    [Object.assign(new Error("401 Unauthorized: You've reached the units usage limit allowed under our free plan"), { status: 401 }), 'QUOTA_EXHAUSTED', false],
    [new Error('Navigation timeout of 45000 ms exceeded'), 'TIMEOUT', true],
  ])('classifies provider errors', (error, code, retryable) => {
    expect(classifyProviderError(error)).toMatchObject({ code, retryable })
  })

  it('does not retry non-retryable Browserbase quota errors', async () => {
    const operation = vi.fn().mockRejectedValue(Object.assign(new Error('HTTP 402'), { status: 402 }))
    const attempt = await executeProvider('browserbase_playwright', operation, { maxAttempts: 5, sleep: vi.fn() })
    expect(operation).toHaveBeenCalledTimes(1)
    expect(attempt.failure).toMatchObject({ code: 'QUOTA_EXHAUSTED', attempts: 1, retryable: false })
  })

  it('retries a transient provider failure with bounded backoff', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('HTTP 503'), { status: 503 }))
      .mockResolvedValueOnce({ ok: true })
    const sleep = vi.fn()
    const attempt = await executeProvider('browserbase_playwright', operation, { maxAttempts: 2, sleep })
    expect(operation).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(attempt.result).toEqual({ ok: true })
  })

  it('redacts provider connection URLs and session identifiers', () => {
    const message = sanitizeProviderErrorMessage(new Error('failed wss://connect.browserbase.com/?sessionId=secret'))
    expect(message).not.toContain('secret')
    expect(message).toContain('<redacted-connection-url>')
  })

  it('uses an explicitly configured local browser executable first', () => {
    const executable = findLocalBrowserExecutable({ LOCAL_PLAYWRIGHT_EXECUTABLE_PATH: 'C:\\browser\\chrome.exe' }, 'win32', value => value === 'C:\\browser\\chrome.exe')
    expect(executable).toBe('C:\\browser\\chrome.exe')
  })

  it('opens and bypasses the quota circuit only under the expected conditions', () => {
    const health = { status: 'quota_exhausted', retryAt: '2030-01-01T00:00:00.000Z' }
    expect(browserbaseQuotaCircuitOpen(health, { now: Date.parse('2029-01-01T00:00:00.000Z') })).toBe(true)
    expect(browserbaseQuotaCircuitOpen(health, { now: Date.parse('2029-01-01T00:00:00.000Z'), forceRetry: true })).toBe(false)
    expect(providerQuotaCircuitOpen(health, { now: Date.parse('2029-01-01T00:00:00.000Z') })).toBe(true)
  })

  it('enforces a source cooldown and permits explicit force retry', () => {
    const health = { sourceCooldowns: { 'vinfast-service-workshops': { cooldownUntil: '2030-01-01T00:00:00.000Z' } } }
    expect(providerCooldownOpen(health, 'vinfast-service-workshops', { now: Date.parse('2029-01-01T00:00:00.000Z') })).toBe(true)
    expect(providerCooldownOpen(health, 'vinfast-service-workshops', { now: Date.parse('2029-01-01T00:00:00.000Z'), forceRetry: true })).toBe(false)
    expect(providerCooldownOpen(health, 'vinfast-warranty-car', { now: Date.parse('2029-01-01T00:00:00.000Z') })).toBe(false)
  })

  it('keeps the newest verified real snapshot when a fallback attempt fails', () => {
    const old = { captureMethod: 'browserbase_playwright', httpStatus: 200, contentHash: 'sha256:old', capturedAt: '2026-08-18T00:00:00.000Z' }
    const latest = { captureMethod: 'local_playwright', httpStatus: 200, contentHash: 'sha256:new', capturedAt: '2026-08-19T00:00:00.000Z' }
    const previous = selectLatestVerifiedSnapshot([old, { captureMethod: 'manual_curated' }, latest])
    expect(previous).toBe(latest)
    expect(shouldRetainPreviousSnapshot({ captureMethod: 'manual_curated', httpStatus: null }, previous)).toBe(true)
    expect(shouldRetainPreviousSnapshot({ ...latest }, previous)).toBe(false)
  })

  it('builds an official Browserless CDP URL without hard-coded credentials', () => {
    const url = new URL(buildBrowserlessCdpUrl({ token: 'browserless-test-token' }))
    expect(url.protocol).toBe('wss:')
    expect(url.hostname).toBe('production-sfo.browserless.io')
    expect(url.searchParams.get('token')).toBe('browserless-test-token')
    expect(url.searchParams.get('blockAds')).toBe('true')
  })

  it('builds a validated residential proxy URL for Vietnam', () => {
    const url = new URL(buildBrowserlessCdpUrl({
      token: 'browserless-test-token',
      endpoint: 'wss://production-sfo.browserless.io/stealth',
      proxy: 'residential',
      proxyCountry: 'vn',
      proxySticky: 'true',
      proxyLocaleMatch: 'true',
      timeout: 180000,
    }))
    expect(url.pathname).toBe('/stealth')
    expect(url.searchParams.get('proxy')).toBe('residential')
    expect(url.searchParams.get('proxyCountry')).toBe('VN')
    expect(url.searchParams.get('proxySticky')).toBe('true')
    expect(url.searchParams.get('proxyLocaleMatch')).toBe('true')
    expect(url.searchParams.get('timeout')).toBe('180000')
  })

  it('rejects an unsafe Browserless session timeout', () => {
    expect(() => buildBrowserlessCdpUrl({ token: 'secret', timeout: 10_000 }))
      .toThrow(/between 30000 and 300000/)
  })

  it('rejects proxy location options when no proxy network is configured', () => {
    expect(() => buildBrowserlessCdpUrl({
      token: 'browserless-test-token',
      proxyCountry: 'VN',
    })).toThrow(/require BROWSERLESS_PROXY/)
  })

  it('prioritizes Bright Data before managed-browser fallbacks for all sources', () => {
    expect(providerOrderForSource('vinfast-service-workshops')).toEqual([
      'http',
      'brightdata_browser_api',
      'browserless_playwright',
      'browserbase_playwright',
      'local_playwright',
    ])
    expect(providerOrderForSource('vinfast-warranty-car')).toEqual([
      'http',
      'brightdata_browser_api',
      'browserless_playwright',
      'browserbase_playwright',
      'local_playwright',
    ])
  })

  it('builds a validated Bright Data Browser API CDP URL from split credentials', () => {
    const url = new URL(buildBrightDataCdpUrl({
      username: 'brd-customer-test-zone-fastlane',
      password: 'brightdata-test-password',
    }))
    expect(url.protocol).toBe('wss:')
    expect(url.hostname).toBe('brd.superproxy.io')
    expect(url.port).toBe('9222')
    expect(url.username).toBe('brd-customer-test-zone-fastlane')
    expect(url.password).toBe('brightdata-test-password')
  })

  it('rejects a Bright Data endpoint outside the official CDP host', () => {
    expect(() => buildBrightDataCdpUrl({
      endpoint: 'wss://example.com:9222',
    })).toThrow(/brd\.superproxy\.io/)
  })

  it('validates Bright Data content before accepting a candidate', () => {
    const capture = validateBrightDataCapture(
      { id: 'vinfast-service-workshops' },
      {
        httpStatus: 200,
        title: 'Hệ thống Showroom & Trạm sạc | VinFast',
        text: 'Khu vực tìm kiếm Tỉnh thành ' + 'Nội dung chính thức '.repeat(20),
      },
    )
    expect(capture.contentValidation).toMatchObject({ status: 'passed', validator: 'brightdata-service-workshop-v1' })
  })

  it('requires the detailed maintenance source to retain its regression evidence', () => {
    const detailedText = `Bộ lọc không khí Nước làm mát pin 12.000km ${'Nội dung bảo dưỡng chính thức '.repeat(220)}`
    const brightData = validateBrightDataCapture(
      { id: 'vinfast-maintenance-car' },
      { httpStatus: 200, title: 'Bảo dưỡng xe VinFast định kỳ', text: detailedText },
    )
    const browserless = validateBrowserlessCapture(
      { id: 'vinfast-maintenance-car' },
      { httpStatus: 200, title: 'Bảo dưỡng xe VinFast định kỳ', text: detailedText },
    )
    expect(brightData.contentValidation).toMatchObject({ status: 'passed', validator: 'brightdata-maintenance-detail-v1' })
    expect(browserless.contentValidation).toMatchObject({ status: 'passed', validator: 'browserless-maintenance-detail-v1' })
  })

  it('rejects a partial maintenance landing page under the detailed source identity', () => {
    expect(() => validateBrightDataCapture(
      { id: 'vinfast-maintenance-car' },
      { httpStatus: 200, title: 'Dịch vụ bảo dưỡng ô tô', text: 'Đặt lịch dịch vụ '.repeat(140) },
    )).toThrow(/content validation failed/)
  })

  it('refuses to send a Browserless token to a non-Browserless endpoint', () => {
    expect(() => buildBrowserlessCdpUrl({ token: 'secret', endpoint: 'wss://example.com/chromium' }))
      .toThrow(/official browserless\.io host/)
  })

  it('accepts Browserless service-workshop content only when expected markers are present', () => {
    const capture = validateBrowserlessCapture(
      { id: 'vinfast-service-workshops' },
      {
        httpStatus: 200,
        title: 'Hệ thống Showroom & Trạm sạc | VinFast',
        text: `${'Nội dung chính thức '.repeat(12)} Khu vực tìm kiếm Tỉnh thành`,
      },
    )
    expect(capture.contentValidation).toMatchObject({ status: 'passed', validator: 'service-workshop-v1' })
  })

  it('marks non-workshop Browserless content as validated after the generic content gate', () => {
    const capture = validateBrowserlessCapture(
      { id: 'vinfast-warranty-car' },
      {
        httpStatus: 200,
        title: 'Chính sách bảo hành ô tô VinFast',
        text: 'Nội dung bảo hành chính thức '.repeat(8),
      },
    )
    expect(capture.contentValidation).toMatchObject({ status: 'passed', validator: 'browserless-content-v1' })
  })

  it('rejects an HTTP 200 Browserless page that lacks service-workshop content', () => {
    let classified
    try {
      validateBrowserlessCapture(
        { id: 'vinfast-service-workshops' },
        { httpStatus: 200, title: 'VinFast', text: 'Trang HTML hợp lệ về kỹ thuật nhưng sai nội dung'.repeat(8) },
      )
    } catch (error) {
      classified = classifyProviderError(error)
    }
    expect(classified).toMatchObject({ code: 'PROVIDER_ERROR', retryable: false })
  })

  it('classifies a Browserless bot-challenge page as access denied', () => {
    let classified
    try {
      validateBrowserlessCapture(
        { id: 'vinfast-service-workshops' },
        { httpStatus: 200, title: 'Access denied', text: 'Verify you are human' },
      )
    } catch (error) {
      classified = classifyProviderError(error)
    }
    expect(classified).toMatchObject({ code: 'ACCESS_DENIED', retryable: false })
  })

  it('never accepts an unvalidated Browserless candidate as a verified snapshot', () => {
    const candidate = {
      captureMethod: 'browserless_playwright',
      httpStatus: 200,
      contentHash: 'sha256:candidate',
      capturedAt: '2026-08-19T00:00:00.000Z',
    }
    expect(isVerifiedSnapshot(candidate)).toBe(false)
    expect(isVerifiedSnapshot({ ...candidate, contentValidation: { status: 'passed' } })).toBe(true)
  })

  it('never accepts an unvalidated Bright Data candidate as a verified snapshot', () => {
    const candidate = {
      captureMethod: 'brightdata_browser_api',
      httpStatus: 200,
      contentHash: 'sha256:candidate',
      capturedAt: '2026-08-19T00:00:00.000Z',
    }
    expect(isVerifiedSnapshot(candidate)).toBe(false)
    expect(isVerifiedSnapshot({ ...candidate, contentValidation: { status: 'passed' } })).toBe(true)
  })
})
