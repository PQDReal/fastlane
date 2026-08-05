import { NextResponse } from 'next/server'

import { auth0 } from '@/lib/auth0'
import { deleteDepositDraft } from '@/lib/deposit/draft-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const session = await auth0.getSession()
  if (typeof session?.user?.sub === 'string') {
    await deleteDepositDraft(session.user.sub)
  }

  const logout = new URL('/auth/logout', request.url)
  // Auth0 OIDC logout requires an absolute, pre-registered redirect URI.
  // Passing just "/" resulted in post_logout_redirect_uri=%2F and Auth0
  // rejected the logout request before its SSO session could be cleared.
  logout.searchParams.set('returnTo', new URL('/', request.url).toString())
  const response = NextResponse.redirect(logout)
  response.headers.set('Cache-Control', 'no-store')
  return response
}
