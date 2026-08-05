import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { auth0 } from './lib/auth0'
import {
  hasValidDeploymentBasicAuth,
  isDeploymentBasicAuthExempt,
  readDeploymentBasicAuthConfig,
} from './lib/auth/deployment-basic-auth'
import { requiresLocalUserValidation } from './lib/auth/middleware-policy'
import { findUserByAuth0Subject, findUserByEmail } from './lib/services/user-service'

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

function clearSessionCookies(request: NextRequest, response: NextResponse) {
  const names = request.cookies.getAll().map((cookie) => cookie.name).filter((name) =>
    name === '__session' ||
    /^__session__\d+$/.test(name) ||
    name === 'appSession' ||
    /^appSession\.\d+$/.test(name) ||
    name.startsWith('__FC'),
  )
  for (const name of new Set(['__session', ...names])) {
    response.cookies.delete({ name, path: '/' })
  }
}

export async function middleware(request: NextRequest) {
  if (!isDeploymentBasicAuthExempt(request.nextUrl.pathname, request.method)) {
    const basicAuthConfig = readDeploymentBasicAuthConfig()
    if (!hasValidDeploymentBasicAuth(
      request.headers.get('authorization'),
      basicAuthConfig,
    )) {
      return new NextResponse('Yêu cầu xác thực để truy cập môi trường này.', {
        status: 401,
        headers: {
          'cache-control': 'no-store',
          'www-authenticate': 'Basic realm="FastLane Preview", charset="UTF-8"',
        },
      })
    }
  }

  const origin = request.headers.get('origin')
  const isApiRequest = request.nextUrl.pathname.startsWith('/api/v1/')
  const isSwaggerOrigin = origin !== null && swaggerOrigins.has(origin)

  if (isApiRequest && isSwaggerOrigin && request.method === 'OPTIONS') {
    return applyCorsHeaders(new NextResponse(null, { status: 204 }), origin)
  }

  const session = await auth0.getSession(request)
  const isAuthRoute = request.nextUrl.pathname.startsWith('/auth/')

  if (
    session &&
    !isAuthRoute &&
    session.user.email_verified === true &&
    requiresLocalUserValidation(request.nextUrl.pathname)
  ) {
    try {
      const subjectUser = await findUserByAuth0Subject(session.user.sub)
      const localUser = subjectUser || (session.user.email ? await findUserByEmail(session.user.email) : null)
      if (!localUser) {
        const response = NextResponse.redirect(new URL('/auth/error?code=account_not_found', request.url))
        clearSessionCookies(request, response)
        response.cookies.set({
          name: 'fastlane_force_login', value: '1', path: '/', maxAge: 600,
          sameSite: 'lax', httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
        })
        return response
      }
    } catch (error) {
      console.error('Unable to validate authenticated local user:', error)
    }
  }

  if (
    session &&
    session.user.email_verified !== true &&
    request.nextUrl.pathname !== '/auth/email-unverified'
  ) {
    const cleanup = new URL('/auth/email-unverified', request.url)
    if (request.nextUrl.pathname === '/auth/popup-complete') {
      cleanup.searchParams.set('popup', '1')
    }
    return NextResponse.redirect(cleanup)
  }

  const response = await auth0.middleware(request)

  if (isApiRequest && isSwaggerOrigin) {
    return applyCorsHeaders(response, origin)
  }

  return response
}

export const config = {
  // Avoid multiple native Basic Auth prompts from parallel asset requests.
  // Pages and API routes remain protected; static files contain no secrets.
  matcher: [
    '/((?!_next/static(?:/|$)|_next/image(?:/|$)|images(?:/|$)|favicon\\.ico$|sitemap\\.xml$|robots\\.txt$).*)',
  ],
}
