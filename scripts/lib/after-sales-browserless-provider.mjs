const DEFAULT_BROWSERLESS_CDP_ENDPOINT = 'wss://production-sfo.browserless.io/chromium/stealth'
const BROWSERLESS_HOST_SUFFIX = '.browserless.io'
const SERVICE_WORKSHOP_SOURCE_ID = 'vinfast-service-workshops'

function normalizeText(value) {
  return String(value || '')
    .normalize('NFC')
    .replace(/\s+/gu, ' ')
    .trim()
}

function providerError(message, providerCode, retryable = false) {
  const error = new Error(message)
  error.providerCode = providerCode
  error.retryable = retryable
  return error
}

export function buildBrowserlessCdpUrl({ token, endpoint = DEFAULT_BROWSERLESS_CDP_ENDPOINT } = {}) {
  if (!token) throw providerError('BROWSERLESS_API_TOKEN is not configured', 'NOT_CONFIGURED')
  let url
  try {
    url = new URL(endpoint)
  } catch {
    throw providerError('BROWSERLESS_CDP_ENDPOINT is invalid', 'PROVIDER_ERROR')
  }
  const hostname = url.hostname.toLowerCase()
  if (url.protocol !== 'wss:' || (hostname !== 'browserless.io' && !hostname.endsWith(BROWSERLESS_HOST_SUFFIX))) {
    throw providerError('BROWSERLESS_CDP_ENDPOINT must use wss:// on an official browserless.io host', 'PROVIDER_ERROR')
  }
  if (url.username || url.password) throw providerError('BROWSERLESS_CDP_ENDPOINT must not contain credentials', 'PROVIDER_ERROR')
  url.searchParams.set('token', token)
  url.searchParams.set('blockAds', 'true')
  return url.toString()
}

export function validateBrowserlessCapture(source, capture) {
  if (source?.id !== SERVICE_WORKSHOP_SOURCE_ID) return capture
  const text = normalizeText(`${capture?.title || ''} ${capture?.text || ''}`)
  const blocked = /\b(?:access denied|request blocked|forbidden|captcha|verify you are human)\b/iu.test(text)
  if (blocked) throw providerError('Browserless response contains an access-denied or bot-challenge page', 'ACCESS_DENIED')

  const expectations = [
    { id: 'showroom_heading', pattern: /Hệ thống Showroom (?:và|&) Trạm sạc/iu },
    { id: 'search_region', pattern: /Khu vực tìm kiếm/iu },
    { id: 'province_selector', pattern: /Tỉnh thành/iu },
  ]
  const missing = expectations.filter(expectation => !expectation.pattern.test(text)).map(expectation => expectation.id)
  if (capture?.httpStatus !== 200 || text.length < 200 || missing.length) {
    throw providerError(`Browserless service-workshop content validation failed: ${missing.join(', ') || 'insufficient content'}`, 'PROVIDER_ERROR')
  }
  return {
    ...capture,
    contentValidation: {
      validator: 'service-workshop-v1',
      status: 'passed',
      expectedMarkers: expectations.map(expectation => expectation.id),
      textLength: text.length,
    },
  }
}

export function providerOrderForSource(sourceId) {
  return sourceId === SERVICE_WORKSHOP_SOURCE_ID
    ? ['http', 'browserless_playwright', 'browserbase_playwright', 'local_playwright']
    : ['http', 'browserbase_playwright', 'local_playwright']
}

export const BROWSERLESS_SERVICE_WORKSHOP_SOURCE_ID = SERVICE_WORKSHOP_SOURCE_ID
