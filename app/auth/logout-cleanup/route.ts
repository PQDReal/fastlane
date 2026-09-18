import { NextResponse } from 'next/server'

import { auth0 } from '@/lib/auth0'
import { resolveAppBaseUrl } from '@/lib/auth/app-base-url'
import { deleteDepositDraft } from '@/lib/deposit/draft-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const session = await auth0.getSession()
  if (typeof session?.user?.sub === 'string') {
    await deleteDepositDraft(session.user.sub)
  }

  const publicBaseUrl = resolveAppBaseUrl()
  if (!publicBaseUrl) {
    throw new Error('APP_BASE_URL is required for the logout redirect')
  }

  const logout = new URL('/auth/logout', publicBaseUrl)
  // Auth0 OIDC logout requires an absolute, pre-registered redirect URI.
  // Passing just "/" resulted in post_logout_redirect_uri=%2F and Auth0
  // rejected the logout request before its SSO session could be cleared.
  logout.searchParams.set('returnTo', new URL('/', publicBaseUrl).toString())
  const response = NextResponse.redirect(logout)
  response.headers.set('Cache-Control', 'no-store')
  return response
}
