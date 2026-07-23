import 'server-only'

import { auth0 } from '@/lib/auth0'
import {
  syncAuth0User,
  type LocalUser,
} from '@/lib/services/user-service'

export async function getCurrentUser(): Promise<LocalUser | null> {
  const session = await auth0.getSession()

  if (!session) return null

  const phoneNumber = session.user.phone_number

  return syncAuth0User({
    sub: session.user.sub,
    email: session.user.email,
    name: session.user.name,
    phone_number: typeof phoneNumber === 'string' ? phoneNumber : null,
  })
}