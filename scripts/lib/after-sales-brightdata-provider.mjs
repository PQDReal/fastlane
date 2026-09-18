const DEFAULT_BRIGHTDATA_CDP_ENDPOINT = 'wss://brd.superproxy.io:9222'
const BRIGHTDATA_CDP_HOST = 'brd.superproxy.io'
import { evaluateCaptureContent } from './after-sales-capture-content-profile.mjs'

function providerError(message, providerCode, retryable = false) {
  const error = new Error(message)
  error.providerCode = providerCode
  error.retryable = retryable
  return error
}

export function hasBrightDataConfiguration(environment = process.env) {
  const endpoint = String(environment.BRIGHTDATA_BROWSER_WS_ENDPOINT || '').trim()
  const username = String(environment.BRIGHTDATA_BROWSER_USERNAME || '').trim()
  const password = String(environment.BRIGHTDATA_BROWSER_PASSWORD || '').trim()
  return Boolean(endpoint || (username && password))
}

export function buildBrightDataCdpUrl({
  endpoint = process.env.BRIGHTDATA_BROWSER_WS_ENDPOINT,
  username = process.env.BRIGHTDATA_BROWSER_USERNAME,
  password = process.env.BRIGHTDATA_BROWSER_PASSWORD,
} = {}) {
  const configuredEndpoint = String(endpoint || '').trim()
  const configuredUsername = String(username || '').trim()
  const configuredPassword = String(password || '').trim()
  if (!configuredEndpoint && (!configuredUsername || !configuredPassword)) {
    throw providerError(
      'Bright Data Browser API is not configured; set BRIGHTDATA_BROWSER_WS_ENDPOINT or BRIGHTDATA_BROWSER_USERNAME/BRIGHTDATA_BROWSER_PASSWORD',
      'NOT_CONFIGURED',
    )
  }

  let url
  try {
    url = new URL(configuredEndpoint || DEFAULT_BRIGHTDATA_CDP_ENDPOINT)
  } catch {
    throw providerError('BRIGHTDATA_BROWSER_WS_ENDPOINT is invalid', 'PROVIDER_ERROR')
  }

  if (url.protocol !== 'wss:' || url.hostname.toLowerCase() !== BRIGHTDATA_CDP_HOST || (url.port && url.port !== '9222')) {
    throw providerError('BRIGHTDATA_BROWSER_WS_ENDPOINT must use wss:// on brd.superproxy.io:9222', 'PROVIDER_ERROR')
  }
  if (url.search || url.hash) {
    throw providerError('BRIGHTDATA_BROWSER_WS_ENDPOINT must not contain query or hash parameters', 'PROVIDER_ERROR')
  }
  if (url.username || url.password) {
    if (configuredUsername || configuredPassword) {
      throw providerError('Provide Bright Data credentials either in the endpoint or as separate environment variables, not both', 'PROVIDER_ERROR')
    }
  } else {
    if (!configuredUsername || !configuredPassword) {
      throw providerError('Bright Data endpoint has no credentials; set BRIGHTDATA_BROWSER_USERNAME and BRIGHTDATA_BROWSER_PASSWORD', 'NOT_CONFIGURED')
    }
    url.username = configuredUsername
    url.password = configuredPassword
  }
  if (!url.port) url.port = '9222'
  return url.toString()
}

export function validateBrightDataCapture(source, capture) {
  const { text, profile, blocked, missing } = evaluateCaptureContent(source, capture)
  if (blocked) throw providerError('Bright Data response contains an access-denied or bot-challenge page', 'ACCESS_DENIED')
  if (capture?.httpStatus !== 200 || text.length < profile.minimumTextLength || missing.length) {
    throw providerError(`Bright Data content validation failed: ${missing.join(', ') || 'insufficient content'}`, 'PROVIDER_ERROR')
  }
  return {
    ...capture,
    contentValidation: {
      validator: `brightdata-${profile.key}-v1`,
      status: 'passed',
      expectedMarkers: profile.expectations.map(expectation => expectation.id),
      textLength: text.length,
    },
  }
}

export const BRIGHTDATA_PROVIDER = 'brightdata_browser_api'
