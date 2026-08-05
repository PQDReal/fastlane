import 'server-only'

import { ApiRouteError } from '@/lib/api/errors'
import { readLocalUserId } from '@/lib/auth/session-identity'
import { getCurrentUser } from '@/lib/auth/current-user'
import { auth0 } from '@/lib/auth0'
import {
  findUserByAuth0Subject,
  findUserByEmail,
} from '@/lib/services/user-service'

export async function requireCurrentCustomer() {
  const user = await getCurrentUser()

  if (!user) {
    throw new ApiRouteError(
      401,
      'AUTHENTICATION_REQUIRED',
      'Authentication is required.',
    )
  }

  if (user.role !== 'CUSTOMER' && user.role !== 'ADMIN') {
    throw new ApiRouteError(
      403,
      'INSUFFICIENT_PERMISSION',
      'A customer or admin account is required.',
    )
  }

  return user
}

export async function requireCurrentCartCustomerId() {
  const session = await auth0.getSession()

  if (!session) {
    throw new ApiRouteError(
      401,
      'AUTHENTICATION_REQUIRED',
      'Authentication is required.',
    )
  }

  if (session.user.email_verified !== true) {
    throw new ApiRouteError(
      401,
      'AUTHENTICATION_REQUIRED',
      'Authentication is required.',
    )
  }

  const cachedUserId = readLocalUserId(session)
  if (cachedUserId) return cachedUserId

  const subject = typeof session.user.sub === 'string'
    ? session.user.sub.trim()
    : ''
  const email = typeof session.user.email === 'string'
    ? session.user.email.trim()
    : ''

  const localUser = subject
    ? await findUserByAuth0Subject(subject)
    : email
      ? await findUserByEmail(email)
      : null

  if (!localUser || localUser.status !== 'ACTIVE') {
    throw new ApiRouteError(
      401,
      'AUTHENTICATION_REQUIRED',
      'Authentication is required.',
    )
  }

  if (localUser.role !== 'CUSTOMER' && localUser.role !== 'ADMIN') {
    throw new ApiRouteError(
      403,
      'INSUFFICIENT_PERMISSION',
      'A customer or admin account is required.',
    )
  }

  try {
    await auth0.updateSession({
      ...session,
      localUserId: localUser.id,
    })
  } catch (error) {
    // The current request has already resolved the identity. A cookie refresh
    // failure should not turn a valid cart mutation into a 500 response.
    console.warn('Unable to persist local cart identity in Auth0 session', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }

  return localUser.id
}
