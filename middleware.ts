import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { auth0 } from './lib/auth0'
import {
  DEPLOYMENT_BASIC_AUTH_COOKIE,
  hasValidDeploymentBasicAuthCookie,
  isDeploymentBasicAuthExempt,
  readDeploymentBasicAuthConfig,
} from './lib/auth/deployment-basic-auth'
import {
  isCartMutationRequest,
  requiresLocalUserValidation,
} from './lib/auth/middleware-policy'
import {
  PREVIEW_AUTH_REQUIRED_CODE,
  PREVIEW_AUTH_REQUIRED_HEADER,
  PREVIEW_AUTH_RETRY_PATH,
  PREVIEW_AUTH_STATUS_PATH,
} from './lib/auth/preview-auth-protocol'
import { toPublicAppUrl } from './lib/auth/app-base-url'
import { findUserByAuth0Subject, findUserByEmail } from './lib/services/user-service'

const swaggerOrigins = new Set(['http://127.0.0.1:8080'])
const BASIC_AUTH_SESSION_PATH = '/api/preview-auth/session'

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
  if (
    request.nextUrl.pathname === PREVIEW_AUTH_RETRY_PATH
    || request.nextUrl.pathname === BASIC_AUTH_SESSION_PATH
  ) {
    return NextResponse.next()
  }

  if (!isDeploymentBasicAuthExempt(request.nextUrl.pathname, request.method)) {
    const basicAuthConfig = readDeploymentBasicAuthConfig()
    const hasValidCookie = await hasValidDeploymentBasicAuthCookie(
      request.cookies.get(DEPLOYMENT_BASIC_AUTH_COOKIE)?.value,
      basicAuthConfig,
    )
    if (basicAuthConfig.enabled && !hasValidCookie) {
      const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`
      const retryHref = `${PREVIEW_AUTH_RETRY_PATH}?returnTo=${encodeURIComponent(returnTo)}`
      const acceptsHtml = request.headers.get('accept')?.includes('text/html') === true
      if ((request.method === 'GET' || request.method === 'HEAD') && acceptsHtml) {
        return NextResponse.redirect(new URL(retryHref, toPublicAppUrl(request.url, process.env, request.headers)))
      }
      return NextResponse.json(
        { error: { code: 'PREVIEW_AUTH_REQUIRED', message: 'Phiên truy cập môi trường đã hết hạn.' } },
        {
          status: 401,
          headers: {
            'cache-control': 'no-store',
            [PREVIEW_AUTH_REQUIRED_HEADER]: PREVIEW_AUTH_REQUIRED_CODE,
          },
        },
      )
    }
  }

  if (request.nextUrl.pathname === PREVIEW_AUTH_STATUS_PATH) {
    return new NextResponse(null, {
      status: 204,
      headers: { 'cache-control': 'no-store' },
    })
  }

  const origin = request.headers.get('origin')
  const isApiRequest = request.nextUrl.pathname.startsWith('/api/v1/')
  const isSwaggerOrigin = origin !== null && swaggerOrigins.has(origin)

  if (isApiRequest && isSwaggerOrigin && request.method === 'OPTIONS') {
    return applyCorsHeaders(new NextResponse(null, { status: 204 }), origin)
  }

  // Cart mutations authenticate in the route and in the RPC. Avoid a second
  // cookie decrypt before the request reaches the handler; this path is hit on
  // every quantity click.
  const isCartMutation = isCartMutationRequest(
    request.nextUrl.pathname,
    request.method,
  )
  const session = isCartMutation ? null : await auth0.getSession(request)
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
        const response = NextResponse.redirect(new URL('/auth/error?code=account_not_found', toPublicAppUrl(request.url, process.env, request.headers)))
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
    const cleanup = new URL('/auth/email-unverified', toPublicAppUrl(request.url, process.env, request.headers))
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
