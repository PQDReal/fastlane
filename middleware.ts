import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { auth0 } from './lib/auth0'
import {
  createDeploymentBasicAuthCookie,
  DEPLOYMENT_BASIC_AUTH_COOKIE,
  DEPLOYMENT_BASIC_AUTH_COOKIE_MAX_AGE,
  hasValidDeploymentBasicAuth,
  hasValidDeploymentBasicAuthCookie,
  isDeploymentBasicAuthExempt,
  readDeploymentBasicAuthConfig,
} from './lib/auth/deployment-basic-auth'
import { requiresLocalUserValidation } from './lib/auth/middleware-policy'
import { findUserByAuth0Subject, findUserByEmail } from './lib/services/user-service'

const swaggerOrigins = new Set(['http://127.0.0.1:8080'])
const BASIC_AUTH_RETRY_PATH = '/__preview-auth/retry'

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
  if (request.nextUrl.pathname === BASIC_AUTH_RETRY_PATH) {
    const basicAuthConfig = readDeploymentBasicAuthConfig()
    const authorization = request.headers.get('authorization')
    if (hasValidDeploymentBasicAuth(authorization, basicAuthConfig)) {
      const cookie = await createDeploymentBasicAuthCookie(basicAuthConfig)
      const requestedReturnTo = request.nextUrl.searchParams.get('returnTo')
      const returnTo = requestedReturnTo?.startsWith('/')
        && !requestedReturnTo.startsWith('//')
        ? requestedReturnTo
        : '/'
      const response = NextResponse.redirect(new URL(returnTo, request.url))
      if (cookie) {
        response.cookies.set({
          name: DEPLOYMENT_BASIC_AUTH_COOKIE,
          value: cookie,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: DEPLOYMENT_BASIC_AUTH_COOKIE_MAX_AGE,
        })
      }
      response.headers.set('cache-control', 'no-store')
      return response
    }

    return new NextResponse('Nhập lại thông tin truy cập môi trường.', {
      status: 401,
      headers: {
        'cache-control': 'no-store',
        'www-authenticate': 'Basic realm="FastLane Preview Retry", charset="UTF-8"',
      },
    })
  }

  if (!isDeploymentBasicAuthExempt(request.nextUrl.pathname, request.method)) {
    const basicAuthConfig = readDeploymentBasicAuthConfig()
    const authorization = request.headers.get('authorization')
    const hasValidCookie = await hasValidDeploymentBasicAuthCookie(
      request.cookies.get(DEPLOYMENT_BASIC_AUTH_COOKIE)?.value,
      basicAuthConfig,
    )
    const hasValidCredentials = hasValidDeploymentBasicAuth(
      authorization,
      basicAuthConfig,
    )
    if (!hasValidCookie && !hasValidCredentials) {
      const credentialsWereSupplied = authorization?.startsWith('Basic ') === true
      const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`
      const retryHref = `${BASIC_AUTH_RETRY_PATH}?returnTo=${encodeURIComponent(returnTo)}`
      return new NextResponse(
        credentialsWereSupplied
          ? `<!doctype html>
<html lang="vi">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Không thể truy cập</title></head>
  <body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#111;color:#fff;font-family:system-ui,sans-serif">
    <main style="max-width:420px;padding:32px;text-align:center">
      <h1 style="font-size:22px">Thông tin đăng nhập không đúng</h1>
      <p style="color:#cbd5e1;line-height:1.6">Tên đăng nhập hoặc mật khẩu môi trường không chính xác.</p>
      <a href="${retryHref}" style="display:inline-block;margin-top:12px;border-radius:10px;background:#e19200;padding:12px 20px;color:#111;text-decoration:none;font-weight:700">Đăng nhập lại</a>
    </main>
  </body>
</html>`
          : 'Yêu cầu xác thực để truy cập môi trường này.',
        {
          status: credentialsWereSupplied ? 403 : 401,
          headers: {
            'cache-control': 'no-store',
            ...(credentialsWereSupplied ? { 'content-type': 'text/html; charset=utf-8' } : {}),
            ...(credentialsWereSupplied
              ? {}
              : { 'www-authenticate': 'Basic realm="FastLane Preview", charset="UTF-8"' }),
          },
        },
      )
    }

    if (
      basicAuthConfig.enabled
      && !hasValidCookie
      && hasValidCredentials
      && (request.method === 'GET' || request.method === 'HEAD')
    ) {
      const cookie = await createDeploymentBasicAuthCookie(basicAuthConfig)
      if (cookie) {
        const response = NextResponse.redirect(request.nextUrl)
        response.cookies.set({
          name: DEPLOYMENT_BASIC_AUTH_COOKIE,
          value: cookie,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: DEPLOYMENT_BASIC_AUTH_COOKIE_MAX_AGE,
        })
        response.headers.set('cache-control', 'no-store')
        return response
      }
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
