import 'server-only'

import { auth0 } from '@/lib/auth0'
import {
  authorizeAccessToken,
  authorizeRequest,
  type AuthorizationPolicy,
} from '@/lib/auth/authorize'
import { ApiAuthError } from '@/lib/auth/errors'

export const adminPrepurchasePolicy = {
  requiredRoles: ['admin'],
  requiredPermissions: ['prepurchase:manage'],
} as const satisfies AuthorizationPolicy

export async function authorizeAdminPrepurchaseRequest(request: Request) {
  if (request.headers.has('authorization')) {
    return authorizeRequest(request, adminPrepurchasePolicy)
  }

  try {
    const accessToken = await auth0.getAccessToken()
    return authorizeAccessToken(accessToken.token, adminPrepurchasePolicy)
  } catch (error) {
    if (error instanceof ApiAuthError) throw error
    throw new ApiAuthError(
      401,
      'AUTHENTICATION_REQUIRED',
      'Authentication is required.',
    )
  }
}
