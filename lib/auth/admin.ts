import 'server-only'

import { auth0 } from '@/lib/auth0'
import {
  authorizeAccessToken,
  authorizeRequest,
  type AuthorizationPolicy,
} from '@/lib/auth/authorize'
import { ApiAuthError } from '@/lib/auth/errors'
import { getCurrentUser } from '@/lib/auth/current-user'

export const adminCatalogPolicy = {
  requiredRoles: ['admin'],
  requiredPermissions: ['catalog:manage'],
} as const satisfies AuthorizationPolicy

export async function authorizeAdminCatalogRequest(request: Request) {
  if (request.headers.has('authorization')) {
    return authorizeRequest(request, adminCatalogPolicy)
  }

  const currentUser = await getCurrentUser()
  if (!currentUser) {
    throw new ApiAuthError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.')
  }
  if (currentUser.role !== 'ADMIN') {
    throw new ApiAuthError(403, 'INSUFFICIENT_PERMISSION', 'Administrator access is required.')
  }

  let token: string

  try {
    const accessToken = await auth0.getAccessToken()
    token = accessToken.token
  } catch (error) {
    console.error('getAccessToken failed in authorizeAdminCatalogRequest:', error)
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

  const currentUser = await getCurrentUser()
  if (!currentUser) {
    throw new ApiAuthError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.')
  }
  if (currentUser.role !== 'ADMIN') {
    throw new ApiAuthError(403, 'INSUFFICIENT_PERMISSION', 'Administrator access is required.')
  }

  let token: string

  try {
    const accessToken = await auth0.getAccessToken()
    token = accessToken.token
  } catch (error) {
    console.error('getAccessToken failed in authorizeAdminInventoryRequest:', error)
    throw new ApiAuthError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.')
  }

  return authorizeAccessToken(token, adminInventoryPolicy)
}