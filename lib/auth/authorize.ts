import { ApiAuthError } from './errors'
import {
  verifyAccessToken,
  type AppRole,
  type VerifiedAccessToken,
} from './jwt'

export interface AuthorizationPolicy {
  requiredPermissions?: readonly string[]
  requiredRoles?: readonly AppRole[]
}

export type AccessTokenVerifier = (
  token: string,
) => Promise<VerifiedAccessToken>

export function bearerToken(headers: Headers) {
  const authorization = headers.get('authorization')

  if (!authorization) {
    throw new ApiAuthError(
      401,
      'AUTHENTICATION_REQUIRED',
      'Authentication is required.',
    )
  }

  const match = /^Bearer +([^\s,]+)$/i.exec(authorization)

  if (!match) {
    throw new ApiAuthError(
      401,
      'INVALID_ACCESS_TOKEN',
      'The access token is invalid or expired.',
    )
  }

  return match[1]
}

export async function authorizeAccessToken(
  token: string,
  policy: AuthorizationPolicy,
  verifier: AccessTokenVerifier = verifyAccessToken,
) {
  const requiredRoles = policy.requiredRoles ?? []
  const requiredPermissions = policy.requiredPermissions ?? []

  if (requiredRoles.length === 0) {
    throw new Error('Authorization policy must require at least one role.')
  }

  if (requiredRoles.includes('admin') && requiredPermissions.length === 0) {
    throw new Error('Admin authorization policy must require a permission.')
  }

  const claims = await verifier(token)
  const hasRequiredRole =
    requiredRoles.length === 0 ||
    requiredRoles.some((role) => claims.roles.includes(role))
  const hasRequiredPermissions = requiredPermissions.every((permission) =>
    claims.permissions.includes(permission),
  )

  if (!hasRequiredRole || !hasRequiredPermissions) {
    throw new ApiAuthError(
      403,
      'INSUFFICIENT_PERMISSION',
      'Permission is insufficient.',
    )
  }

  return claims
}

export async function authorizeRequest(
  request: Request,
  policy: AuthorizationPolicy,
  verifier: AccessTokenVerifier = verifyAccessToken,
) {
  return authorizeAccessToken(bearerToken(request.headers), policy, verifier)
}
