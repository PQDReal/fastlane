import { auth0 } from '../lib/auth0'
import { Header } from './header'

export async function AuthenticatedHeader() {
  const session = await auth0.getSession()
  const user = session
    ? {
        email: session.user.email,
        name: session.user.name,
      }
    : undefined

  return <Header user={user} />
}
