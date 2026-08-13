import 'server-only'

import { ApiRouteError } from '@/lib/api/errors'
import { getCurrentUser } from '@/lib/auth/current-user'
import {
  findUserByAuth0Subject,
  type LocalUser,
} from '@/lib/services/user-service'

const ADMIN_IDENTITY_MESSAGE = 'Không xác định được tài khoản quản trị thực hiện thao tác.'

function isActiveAdmin(user: LocalUser | null): user is LocalUser {
  return user?.role === 'ADMIN' && user.status === 'ACTIVE'
}

/**
 * Resolve the local user whose ID will be persisted by an audited mutation.
 *
 * Bearer calls must stay bound to the token subject. Dashboard calls may use
 * the same verified-email fallback as getCurrentUser while older local users
 * are being linked to their current Auth0 subject.
 */
export async function requireAdminMutationIdentity(
  request: Request,
  subject: string,
): Promise<LocalUser> {
  const subjectUser = await findUserByAuth0Subject(subject)
  if (subjectUser) {
    if (isActiveAdmin(subjectUser)) return subjectUser
    throw new ApiRouteError(403, 'ADMIN_IDENTITY_REQUIRED', ADMIN_IDENTITY_MESSAGE)
  }

  if (!request.headers.has('authorization')) {
    const sessionUser = await getCurrentUser()
    if (isActiveAdmin(sessionUser)) return sessionUser
  }

  throw new ApiRouteError(403, 'ADMIN_IDENTITY_REQUIRED', ADMIN_IDENTITY_MESSAGE)
}
