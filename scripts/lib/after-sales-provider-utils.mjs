import fs from 'node:fs'
import path from 'node:path'

export const REAL_CAPTURE_PROVIDERS = new Set(['http', 'brightdata_browser_api', 'browserless_playwright', 'browserbase_playwright', 'local_playwright'])
export const VALIDATED_BROWSER_PROVIDERS = new Set(['brightdata_browser_api', 'browserless_playwright'])
export const PROVIDER_CLASSIFICATIONS = new Set([
  'AVAILABLE',
  'AUTH_FAILED',
  'QUOTA_EXHAUSTED',
  'RATE_LIMITED',
  'ACCESS_DENIED',
  'PROVIDER_ERROR',
  'NOT_CONFIGURED',
  'TIMEOUT',
  'COOLDOWN_ACTIVE',
])

function statusFromError(error) {
  const explicit = Number(error?.status || error?.statusCode || error?.response?.status)
  if (Number.isInteger(explicit) && explicit >= 100 && explicit <= 599) return explicit
  const match = String(error?.message || '').match(/(?:HTTP\s*)?\b([45]\d{2})\b/i)
  return match ? Number(match[1]) : null
}

export function sanitizeProviderErrorMessage(error) {
  return String(error?.message || error || 'Unknown provider error')
    .replace(/wss?:\/\/[^\s"']+/giu, '<redacted-connection-url>')
    .replace(/([?&](?:token|apiKey|sessionId)=)[^&\s]+/giu, '$1<redacted>')
}

export function classifyProviderError(error) {
  const status = statusFromError(error)
  const message = sanitizeProviderErrorMessage(error)
  if (error?.providerCode && PROVIDER_CLASSIFICATIONS.has(error.providerCode)) {
    return { code: error.providerCode, status, retryable: Boolean(error.retryable), message }
  }
  if (/\b(?:units? usage limit|free plan.*limit|quota exhausted|quota exceeded|browser units? limit|subscription limit)\b/iu.test(message)) {
    return { code: 'QUOTA_EXHAUSTED', status: status || 402, retryable: false, message }
  }
  if (status === 401 || /\b(?:unauthori[sz]ed|invalid token|authentication failed)\b/iu.test(message)) {
    return { code: 'AUTH_FAILED', status: status || 401, retryable: false, message }
  }
  if (status === 402) return { code: 'QUOTA_EXHAUSTED', status, retryable: false, message }
  if (status === 429) return { code: 'RATE_LIMITED', status, retryable: true, message }
  if (status && status >= 500) return { code: 'PROVIDER_ERROR', status, retryable: true, message }
  if (status === 403) return { code: 'ACCESS_DENIED', status, retryable: false, message }
  if (/\b(?:rate limited|too many requests)\b/iu.test(message)) {
    return { code: 'RATE_LIMITED', status, retryable: true, message }
  }
  if (/\b(?:access denied|forbidden)\b/iu.test(message)) {
    return { code: 'ACCESS_DENIED', status, retryable: false, message }
  }
  if (status && status >= 400) return { code: 'PROVIDER_CLIENT_ERROR', status, retryable: false, message }
  if (/timeout|timed out|aborterror/iu.test(`${error?.name || ''} ${message}`)) {
    return { code: 'TIMEOUT', status: null, retryable: true, message }
  }
  if (/not configured|not installed|executable.*not found/iu.test(message)) {
    return { code: 'NOT_CONFIGURED', status: null, retryable: false, message }
  }
  return { code: 'PROVIDER_ERROR', status: null, retryable: true, message }
}

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms))

export async function executeProvider(provider, operation, { maxAttempts = 1, sleep = defaultSleep } = {}) {
  let classified = null
  let attempts = 0
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt
    try {
      return { result: await operation(), failure: null }
    } catch (error) {
      classified = classifyProviderError(error)
      if (!classified.retryable || attempt === maxAttempts) break
      await sleep(500 * attempt)
    }
  }
  return {
    result: null,
    failure: {
      provider,
      ...classified,
      attempts,
    },
  }
}

export function findLocalBrowserExecutable(environment = process.env, platform = process.platform, exists = fs.existsSync) {
  const candidates = [environment.LOCAL_PLAYWRIGHT_EXECUTABLE_PATH]
  if (platform === 'win32') {
    candidates.push(
      environment.ProgramFiles && path.join(environment.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      environment['ProgramFiles(x86)'] && path.join(environment['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
      environment.LOCALAPPDATA && path.join(environment.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      environment.ProgramFiles && path.join(environment.ProgramFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      environment['ProgramFiles(x86)'] && path.join(environment['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    )
  } else if (platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    )
  } else {
    candidates.push('/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge')
  }
  return [...new Set(candidates.filter(Boolean))].find(candidate => exists(candidate)) || null
}

export function providerQuotaCircuitOpen(providerHealth, { now = Date.now(), forceRetry = false } = {}) {
  if (forceRetry || providerHealth?.status !== 'quota_exhausted') return false
  const retryAt = Date.parse(providerHealth.retryAt || '')
  return Number.isFinite(retryAt) && retryAt > now
}

export function providerCooldownOpen(providerHealth, sourceId, { now = Date.now(), forceRetry = false } = {}) {
  if (forceRetry) return false
  const cooldownUntil = Date.parse(providerHealth?.sourceCooldowns?.[sourceId]?.cooldownUntil || '')
  return Number.isFinite(cooldownUntil) && cooldownUntil > now
}

export const browserbaseQuotaCircuitOpen = providerQuotaCircuitOpen

export function selectLatestVerifiedSnapshot(snapshots) {
  return [...snapshots]
    .filter(isVerifiedSnapshot)
    .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))[0] || null
}

export function isVerifiedSnapshot(snapshot) {
  if (!REAL_CAPTURE_PROVIDERS.has(snapshot?.captureMethod) || snapshot.httpStatus !== 200 || !snapshot.contentHash) return false
  return !VALIDATED_BROWSER_PROVIDERS.has(snapshot.captureMethod) || snapshot.contentValidation?.status === 'passed'
}

export function shouldRetainPreviousSnapshot(current, previous) {
  return !isVerifiedSnapshot(current) && Boolean(previous)
}
