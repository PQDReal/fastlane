import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { auth0 } from './lib/auth0'

const swaggerOrigins = new Set(['http://127.0.0.1:8080'])

function applyCorsHeaders(response: NextResponse, origin: string) {
  response.headers.set('access-control-allow-origin', origin)
  response.headers.set(
    'access-control-allow-methods',
    'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  )
  response.headers.set(
    'access-control-allow-headers',
    'Accept, Authorization, Content-Type',
  )
  response.headers.append('vary', 'Origin')
  return response
}

export async function middleware(request: NextRequest) {
  const origin = request.headers.get('origin')
  const isApiRequest = request.nextUrl.pathname.startsWith('/api/v1/')
  const isSwaggerOrigin = origin !== null && swaggerOrigins.has(origin)

  if (isApiRequest && isSwaggerOrigin && request.method === 'OPTIONS') {
    return applyCorsHeaders(new NextResponse(null, { status: 204 }), origin)
  }

  const session = await auth0.getSession(request)

  if (
    session &&
    session.user.email_verified !== true &&
    request.nextUrl.pathname !== '/auth/email-unverified'
  ) {
    return NextResponse.redirect(new URL('/auth/email-unverified', request.url))
  }

  const response = await auth0.middleware(request)

  if (isApiRequest && isSwaggerOrigin) {
    return applyCorsHeaders(response, origin)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static(?:/|$)|_next/image(?:/|$)|images(?:/|$)|favicon\\.ico$|sitemap\\.xml$|robots\\.txt$).*)',
  ],
}