import 'server-only'

import { auth0 } from '@/lib/auth0'
import {
  findUserByEmail,
  findUserByAuth0Subject,
  type LocalUser,
} from '@/lib/services/user-service'

export async function getCurrentUser(): Promise<LocalUser | null> {
  const session = await auth0.getSession()

  if (!session) return null

  const existingUser = await findUserByAuth0Subject(session.user.sub)
  if (existingUser) return existingUser.status === 'ACTIVE' ? existingUser : null

  const email = session.user.email?.trim()
  if (!email) return null

  const emailUser = await findUserByEmail(email)
  return emailUser?.status === 'ACTIVE' ? emailUser : null
}