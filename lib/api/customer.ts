import 'server-only'

import { ApiRouteError } from '@/lib/api/errors'
import { getCurrentUser } from '@/lib/auth/current-user'

export async function requireCurrentCustomer() {
  const user = await getCurrentUser()

  if (!user) {
    throw new ApiRouteError(
      401,
      'AUTHENTICATION_REQUIRED',
      'Authentication is required.',
    )
  }

  if (user.role !== 'CUSTOMER') {
    throw new ApiRouteError(
      403,
      'INSUFFICIENT_PERMISSION',
      'A customer account is required.',
    )
  }

  return user
}
