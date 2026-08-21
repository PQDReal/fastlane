const DEFAULT_BROWSERLESS_CDP_ENDPOINT = 'wss://production-sfo.browserless.io/chromium/stealth'
const BROWSERLESS_HOST_SUFFIX = '.browserless.io'
const SERVICE_WORKSHOP_SOURCE_ID = 'vinfast-service-workshops'
const BROWSERLESS_PROXY_NETWORKS = new Set(['residential', 'datacenter'])
import { evaluateCaptureContent } from './after-sales-capture-content-profile.mjs'

function providerError(message, providerCode, retryable = false) {
  const error = new Error(message)
  error.providerCode = providerCode
  error.retryable = retryable
  return error
}

function normalizeBooleanOption(value, name) {
  if (value === undefined || value === null || value === '') return null
  if (value === true || String(value).toLowerCase() === 'true') return 'true'
  if (value === false || String(value).toLowerCase() === 'false') return 'false'
  throw providerError(`${name} must be true or false`, 'PROVIDER_ERROR')
}

export function buildBrowserlessCdpUrl({
  token,
  endpoint = DEFAULT_BROWSERLESS_CDP_ENDPOINT,
  proxy,
  proxyCountry,
  proxySticky,
  proxyLocaleMatch,
  timeout,
} = {}) {
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

  const configuredProxy = String(proxy || url.searchParams.get('proxy') || '').toLowerCase()
  const configuredCountry = String(proxyCountry || url.searchParams.get('proxyCountry') || '').toUpperCase()
  const configuredSticky = normalizeBooleanOption(proxySticky ?? url.searchParams.get('proxySticky'), 'BROWSERLESS_PROXY_STICKY')
  const configuredLocaleMatch = normalizeBooleanOption(proxyLocaleMatch ?? url.searchParams.get('proxyLocaleMatch'), 'BROWSERLESS_PROXY_LOCALE_MATCH')
  const configuredTimeout = timeout ?? url.searchParams.get('timeout')

  if (configuredProxy && !BROWSERLESS_PROXY_NETWORKS.has(configuredProxy)) {
    throw providerError('BROWSERLESS_PROXY must be residential or datacenter', 'PROVIDER_ERROR')
  }
  if (configuredCountry && !/^[A-Z]{2}$/u.test(configuredCountry)) {
    throw providerError('BROWSERLESS_PROXY_COUNTRY must be a two-letter ISO country code', 'PROVIDER_ERROR')
  }
  if ((configuredCountry || configuredSticky || configuredLocaleMatch) && !configuredProxy) {
    throw providerError('Browserless proxy options require BROWSERLESS_PROXY', 'PROVIDER_ERROR')
  }
  if (configuredTimeout !== undefined && configuredTimeout !== null && configuredTimeout !== '') {
    const milliseconds = Number(configuredTimeout)
    if (!Number.isInteger(milliseconds) || milliseconds < 30_000 || milliseconds > 300_000) {
      throw providerError('Browserless timeout must be an integer between 30000 and 300000 milliseconds', 'PROVIDER_ERROR')
    }
    url.searchParams.set('timeout', String(milliseconds))
  }

  url.searchParams.set('token', token)
  url.searchParams.set('blockAds', 'true')
  if (configuredProxy) url.searchParams.set('proxy', configuredProxy)
  if (configuredCountry) url.searchParams.set('proxyCountry', configuredCountry)
  if (configuredSticky) url.searchParams.set('proxySticky', configuredSticky)
  if (configuredLocaleMatch) url.searchParams.set('proxyLocaleMatch', configuredLocaleMatch)
  return url.toString()
}

export function validateBrowserlessCapture(source, capture) {
  const { text, profile, blocked, missing } = evaluateCaptureContent(source, capture)
  if (blocked) throw providerError('Browserless response contains an access-denied or bot-challenge page', 'ACCESS_DENIED')
  if (capture?.httpStatus !== 200 || text.length < profile.minimumTextLength || missing.length) {
    throw providerError(`Browserless content validation failed: ${missing.join(', ') || 'insufficient content'}`, 'PROVIDER_ERROR')
  }
  return {
    ...capture,
    contentValidation: {
      validator: profile.key === 'service-workshop' ? 'service-workshop-v1' : `browserless-${profile.key}-v1`,
      status: 'passed',
      expectedMarkers: profile.expectations.map(expectation => expectation.id),
      textLength: text.length,
    },
  }
}

export function providerOrderForSource(sourceId) {
  return ['http', 'brightdata_browser_api', 'browserless_playwright', 'browserbase_playwright', 'local_playwright']
}

export const BROWSERLESS_SERVICE_WORKSHOP_SOURCE_ID = SERVICE_WORKSHOP_SOURCE_ID
