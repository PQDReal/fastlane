import 'server-only'

import { auth0 } from '@/lib/auth0'
import type { ServerTimingRecorder } from '@/lib/api/server-timing'
import { readLocalUserId } from '@/lib/auth/session-identity'
import {
  findUserByEmail,
  findUserById,
  findUserByAuth0Subject,
  type LocalUser,
} from '@/lib/services/user-service'

export async function getCurrentUser(
  timing?: ServerTimingRecorder,
): Promise<LocalUser | null> {
  const sessionStartedAt = performance.now()
  const session = await auth0.getSession()
  timing?.measure('auth_session', sessionStartedAt)

  if (!session) return null

  const localUserId = readLocalUserId(session)
  if (localUserId) {
    const idLookupStartedAt = performance.now()
    const localUser = await findUserById(localUserId)
    timing?.measure('auth_user_id', idLookupStartedAt)
    if (localUser) return localUser.status === 'ACTIVE' ? localUser : null
  }

  const subjectLookupStartedAt = performance.now()
  const existingUser = await findUserByAuth0Subject(session.user.sub)
  timing?.measure('auth_user', subjectLookupStartedAt)
  if (existingUser) return existingUser.status === 'ACTIVE' ? existingUser : null

  const email = session.user.email?.trim()
  if (!email) return null

  const emailLookupStartedAt = performance.now()
  const emailUser = await findUserByEmail(email)
  timing?.measure('auth_user_email', emailLookupStartedAt)
  return emailUser?.status === 'ACTIVE' ? emailUser : null
}
