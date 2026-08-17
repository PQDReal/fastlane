import 'server-only'

import { AccessTokenError } from '@auth0/nextjs-auth0/errors'

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
      error instanceof AccessTokenError
        ? 'Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập lại.'
        : 'Không thể xác thực phiên đăng nhập. Vui lòng đăng nhập lại.',
    )
  }
}
