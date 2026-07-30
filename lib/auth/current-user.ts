import 'server-only'

import { auth0 } from '@/lib/auth0'
import {
  findUserByAuth0Subject,
  syncAuth0User,
  type LocalUser,
} from '@/lib/services/user-service'

export async function getCurrentUser(): Promise<LocalUser | null> {
  const session = await auth0.getSession()

  if (!session) return null

  const existingUser = await findUserByAuth0Subject(session.user.sub)
  if (existingUser) return existingUser.status === 'ACTIVE' ? existingUser : null

  const phoneNumber = session.user.phone_number

  const user = await syncAuth0User({
    sub: session.user.sub,
    email: session.user.email,
    email_verified: session.user.email_verified,
    name: session.user.name,
    phone_number: typeof phoneNumber === 'string' ? phoneNumber : null,
  })
  return user.status === 'ACTIVE' ? user : null
}