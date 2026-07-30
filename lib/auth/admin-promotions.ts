import 'server-only'

import { auth0 } from '@/lib/auth0'
import {
  authorizeAccessToken,
  authorizeRequest,
  type AuthorizationPolicy,
} from '@/lib/auth/authorize'
import { ApiAuthError } from '@/lib/auth/errors'
import { getCurrentUser } from '@/lib/auth/current-user'

export const adminPromotionPolicy = {
  requiredRoles: ['admin'],
  requiredPermissions: ['promotion:manage'],
} as const satisfies AuthorizationPolicy

export async function authorizeAdminPromotionRequest(request: Request) {
  if (request.headers.has('authorization')) {
    return authorizeRequest(request, adminPromotionPolicy)
  }

  const currentUser = await getCurrentUser()
  if (!currentUser) {
    throw new ApiAuthError(
      401,
      'AUTHENTICATION_REQUIRED',
      'Authentication is required.',
    )
  }
  if (currentUser.role !== 'ADMIN') {
    throw new ApiAuthError(
      403,
      'INSUFFICIENT_PERMISSION',
      'Administrator access is required.',
    )
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

  return authorizeAccessToken(token, adminPromotionPolicy)
}
