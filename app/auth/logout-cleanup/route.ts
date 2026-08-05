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
  logout.searchParams.set('returnTo', '/')
  const response = NextResponse.redirect(logout)
  response.headers.set('Cache-Control', 'no-store')
  return response
}
