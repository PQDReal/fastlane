import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { createServerTiming } from './lib/api/server-timing'
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
  const timedReadRoutes = new Set([
    '/api/v1/admin/categories',
    '/api/v1/admin/products',
    '/api/v1/admin/inventory/query',
    '/api/v1/admin/inventory/filter-options',
    '/api/v1/users/me',
  ])
  const tracesRead = request.method === 'GET'
    && timedReadRoutes.has(request.nextUrl.pathname)
  const timing = tracesRead ? createServerTiming('middleware') : null
  const finish = (response: NextResponse) => {
    if (!timing) return response

    const timedResponse = timing.attach(response)
    const middlewareTiming = timedResponse.headers.get('Server-Timing') ?? ''
    timedResponse.headers.set(
      'X-Fastlane-Middleware-Timing',
      middlewareTiming,
    )
    // A middleware Server-Timing header would overwrite the route handler's
    // richer breakdown. Preserve middleware timing under its diagnostic header
    // and let the final response own Server-Timing.
    timedResponse.headers.delete('Server-Timing')
    return timedResponse
  }

  if (
    request.nextUrl.pathname === PREVIEW_AUTH_RETRY_PATH
    || request.nextUrl.pathname === BASIC_AUTH_SESSION_PATH
  ) {
    return finish(NextResponse.next())
  }

  const previewAuthStartedAt = performance.now()
  if (!isDeploymentBasicAuthExempt(request.nextUrl.pathname, request.method)) {
    const basicAuthConfig = readDeploymentBasicAuthConfig()
    const hasValidCookie = await hasValidDeploymentBasicAuthCookie(
      request.cookies.get(DEPLOYMENT_BASIC_AUTH_COOKIE)?.value,
      basicAuthConfig,
    )
    if (basicAuthConfig.enabled && !hasValidCookie) {
      timing?.measure('mw_preview_auth', previewAuthStartedAt)
      const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`
      const retryHref = `${PREVIEW_AUTH_RETRY_PATH}?returnTo=${encodeURIComponent(returnTo)}`
      const acceptsHtml = request.headers.get('accept')?.includes('text/html') === true
      if ((request.method === 'GET' || request.method === 'HEAD') && acceptsHtml) {
        return finish(NextResponse.redirect(new URL(retryHref, toPublicAppUrl(request.url, process.env, request.headers))))
      }
      return finish(NextResponse.json(
        { error: { code: 'PREVIEW_AUTH_REQUIRED', message: 'Phiên truy cập môi trường đã hết hạn.' } },
        {
          status: 401,
          headers: {
            'cache-control': 'no-store',
            [PREVIEW_AUTH_REQUIRED_HEADER]: PREVIEW_AUTH_REQUIRED_CODE,
          },
        },
      ))
    }
  }
  timing?.measure('mw_preview_auth', previewAuthStartedAt)

  if (request.nextUrl.pathname === PREVIEW_AUTH_STATUS_PATH) {
    return finish(new NextResponse(null, {
      status: 204,
      headers: { 'cache-control': 'no-store' },
    }))
  }

  const origin = request.headers.get('origin')
  const isApiRequest = request.nextUrl.pathname.startsWith('/api/v1/')
  const isSwaggerOrigin = origin !== null && swaggerOrigins.has(origin)

  if (isApiRequest && isSwaggerOrigin && request.method === 'OPTIONS') {
    return finish(applyCorsHeaders(new NextResponse(null, { status: 204 }), origin))
  }

  // Cart mutations authenticate in the route and in the RPC. Avoid a second
  // cookie decrypt before the request reaches the handler; this path is hit on
  // every quantity click.
  const isCartMutation = isCartMutationRequest(
    request.nextUrl.pathname,
    request.method,
  )
  const middlewareSessionStartedAt = performance.now()
  // API handlers own authentication/authorization and read the encrypted
  // session themselves. Reading it here as well doubles cookie/session work
  // for every XHR without adding a security boundary.
  const session = isCartMutation || isApiRequest ? null : await auth0.getSession(request)
  timing?.measure('mw_session', middlewareSessionStartedAt)
  const isAuthRoute = request.nextUrl.pathname.startsWith('/auth/')

  if (
    session &&
    !isAuthRoute &&
    session.user.email_verified === true &&
    requiresLocalUserValidation(request.nextUrl.pathname)
  ) {
    const localUserStartedAt = performance.now()
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
        timing?.measure('mw_user', localUserStartedAt)
        return finish(response)
      }
    } catch (error) {
      console.error('Unable to validate authenticated local user:', error)
    }
    timing?.measure('mw_user', localUserStartedAt)
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
    return finish(NextResponse.redirect(cleanup))
  }

  if (isApiRequest) {
    const apiResponse = NextResponse.next()
    timing?.measure('mw_api_passthrough', performance.now())
    return finish(isSwaggerOrigin ? applyCorsHeaders(apiResponse, origin) : apiResponse)
  }

  const auth0MiddlewareStartedAt = performance.now()
  const response = await auth0.middleware(request)
  timing?.measure('mw_auth0', auth0MiddlewareStartedAt)

  if (isApiRequest && isSwaggerOrigin) {
    return finish(applyCorsHeaders(response, origin))
  }

  return finish(response)
}

export const config = {
  // Avoid multiple native Basic Auth prompts from parallel asset requests.
  // Pages and API routes remain protected; static files contain no secrets.
  matcher: [
    '/((?!_next/static(?:/|$)|_next/image(?:/|$)|images(?:/|$)|favicon\\.ico$|sitemap\\.xml$|robots\\.txt$).*)',
  ],
}
