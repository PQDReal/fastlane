import 'server-only'

import { auth0 } from '@/lib/auth0'
import {
  authorizeAccessToken,
  authorizeRequest,
  type AuthorizationPolicy,
} from '@/lib/auth/authorize'
import { ApiAuthError } from '@/lib/auth/errors'

export const adminCatalogPolicy = {
  requiredRoles: ['admin'],
  requiredPermissions: ['catalog:manage'],
} as const satisfies AuthorizationPolicy

export async function authorizeAdminCatalogRequest(request: Request) {
  if (request.headers.has('authorization')) {
    return authorizeRequest(request, adminCatalogPolicy)
  }

  let token: string

  try {
    const accessToken = await auth0.getAccessToken()
    token = accessToken.token
  } catch {
    throw new ApiAuthError(
      401,
      'AUTHENTICATION_REQUIRED',
      'Authentication is required.',
    )
  }

  return authorizeAccessToken(token, adminCatalogPolicy)
}
export const adminInventoryPolicy = {
  requiredRoles: ['admin'],
  requiredPermissions: ['inventory:manage'],
} as const satisfies AuthorizationPolicy

export async function authorizeAdminInventoryRequest(request: Request) {
  if (request.headers.has('authorization')) {
    return authorizeRequest(request, adminInventoryPolicy)
  }

  let token: string

  try {
    const accessToken = await auth0.getAccessToken()
    token = accessToken.token
  } catch {
    throw new ApiAuthError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.')
  }

  return authorizeAccessToken(token, adminInventoryPolicy)
}