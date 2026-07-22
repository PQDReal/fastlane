import {
  createRemoteJWKSet,
  errors,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose'

import { readAuth0ApiConfig, type Auth0ApiConfig } from './config'
import { ApiAuthError } from './errors'

export type AppRole = 'customer' | 'admin'

export interface VerifiedAccessToken {
  payload: JWTPayload
  subject: string
  roles: AppRole[]
  permissions: string[]
}

const remoteKeySets = new Map<string, JWTVerifyGetKey>()

function remoteKeySet(url: URL) {
  const key = url.toString()
  const existing = remoteKeySets.get(key)

  if (existing) return existing

  const created = createRemoteJWKSet(url)
  remoteKeySets.set(key, created)
  return created
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

function appRoles(value: unknown): AppRole[] {
  const roles = stringArray(value)
    .map((role) => role.toLowerCase())
    .filter((role): role is AppRole => role === 'customer' || role === 'admin')

  return [...new Set(roles)]
}

const invalidTokenErrorCodes = new Set([
  'ERR_JOSE_ALG_NOT_ALLOWED',
  'ERR_JOSE_NOT_SUPPORTED',
  'ERR_JWS_INVALID',
  'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
  'ERR_JWT_CLAIM_VALIDATION_FAILED',
  'ERR_JWT_EXPIRED',
  'ERR_JWT_INVALID',
  'ERR_JWKS_MULTIPLE_MATCHING_KEYS',
  'ERR_JWKS_NO_MATCHING_KEY',
])

function invalidAccessToken() {
  return new ApiAuthError(
    401,
    'INVALID_ACCESS_TOKEN',
    'The access token is invalid or expired.',
  )
}

export function createAccessTokenVerifier(
  config: Auth0ApiConfig,
  keySet: JWTVerifyGetKey = remoteKeySet(config.jwksUri),
) {
  return async function verifyAccessToken(token: string): Promise<VerifiedAccessToken> {
    try {
      const { payload } = await jwtVerify(token, keySet, {
        algorithms: ['RS256'],
        audience: config.audience,
        issuer: config.issuer,
        requiredClaims: ['iss', 'sub', 'aud', 'exp'],
      })

      if (typeof payload.sub !== 'string' || payload.sub.trim() === '') {
        throw invalidAccessToken()
      }

      return {
        payload,
        subject: payload.sub,
        roles: appRoles(payload[config.rolesClaim]),
        permissions: stringArray(payload.permissions),
      }
    } catch (error) {
      if (error instanceof ApiAuthError) throw error

      if (
        error instanceof errors.JOSEError &&
        invalidTokenErrorCodes.has(error.code)
      ) {
        throw invalidAccessToken()
      }

      // Infrastructure and verifier faults must surface as server errors rather
      // than misleading callers with an INVALID_ACCESS_TOKEN response.
      throw error
    }
  }
}

export function verifyAccessToken(token: string) {
  const config = readAuth0ApiConfig()
  return createAccessTokenVerifier(config)(token)
}
