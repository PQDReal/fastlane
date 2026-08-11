const VNPAY_IPN_PATH = '/api/v1/payments/vnpay/ipn'
const CONTRACT_EXPIRY_CRON_PATH = '/api/v1/deposit-orders/expire-contracts'
export const DEPLOYMENT_BASIC_AUTH_COOKIE = 'fastlane_preview_access'
export const DEPLOYMENT_BASIC_AUTH_COOKIE_MAX_AGE = 30 * 60
const COOKIE_VERSION = 'v1'

export type DeploymentBasicAuthConfig = {
  enabled: boolean
  username?: string
  password?: string
}

export function readDeploymentBasicAuthConfig(
  environment: NodeJS.ProcessEnv = process.env,
): DeploymentBasicAuthConfig {
  return {
    enabled: environment.DEPLOY_BASIC_AUTH_ENABLED?.trim().toLowerCase() === 'true',
    username: environment.DEPLOY_BASIC_AUTH_USER?.trim() || undefined,
    password: environment.DEPLOY_BASIC_AUTH_PASSWORD || undefined,
  }
}

export function isDeploymentBasicAuthExempt(pathname: string, method: string) {
  const normalizedMethod = method.toUpperCase()
  return (pathname === VNPAY_IPN_PATH && normalizedMethod === 'GET')
    || (pathname === '/api/webhooks/didit' && normalizedMethod === 'POST')
    || (pathname === CONTRACT_EXPIRY_CRON_PATH && normalizedMethod === 'POST')
}

export function hasValidDeploymentBasicAuth(
  authorization: string | null,
  config: DeploymentBasicAuthConfig,
) {
  if (!config.enabled) return true
  if (!config.username || !config.password || !authorization?.startsWith('Basic ')) {
    return false
  }

  try {
    const encodedBytes = atob(authorization.slice(6))
    const credentials = new TextDecoder().decode(
      Uint8Array.from(encodedBytes, (character) => character.charCodeAt(0)),
    )
    const separator = credentials.indexOf(':')
    if (separator < 0) return false

    return credentials.slice(0, separator) === config.username
      && credentials.slice(separator + 1) === config.password
  } catch {
    return false
  }
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function cookieSigningKey(config: DeploymentBasicAuthConfig) {
  if (!config.username || !config.password) return null
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(config.password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

function cookiePayload(expiresAt: number) {
  return `${COOKIE_VERSION}.${expiresAt}`
}

function cookieMessage(payload: string, username: string) {
  return `${payload}.${username}`
}

export async function createDeploymentBasicAuthCookie(
  config: DeploymentBasicAuthConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (!config.enabled) return null
  const key = await cookieSigningKey(config)
  if (!key || !config.username) return null

  const payload = cookiePayload(nowSeconds + DEPLOYMENT_BASIC_AUTH_COOKIE_MAX_AGE)
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(cookieMessage(payload, config.username)),
  )
  return `${payload}.${encodeBase64Url(new Uint8Array(signature))}`
}

export async function hasValidDeploymentBasicAuthCookie(
  value: string | undefined,
  config: DeploymentBasicAuthConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (!config.enabled || !value || !config.username) return false
  const [version, expiresAtText, signatureText, ...extra] = value.split('.')
  const expiresAt = Number(expiresAtText)
  if (
    version !== COOKIE_VERSION
    || extra.length > 0
    || !signatureText
    || !Number.isInteger(expiresAt)
    || expiresAt <= nowSeconds
  ) {
    return false
  }

  try {
    const key = await cookieSigningKey(config)
    if (!key) return false
    const payload = cookiePayload(expiresAt)
    return crypto.subtle.verify(
      'HMAC',
      key,
      decodeBase64Url(signatureText),
      new TextEncoder().encode(cookieMessage(payload, config.username)),
    )
  } catch {
    return false
  }
}
