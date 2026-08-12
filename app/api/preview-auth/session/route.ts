import { NextResponse } from 'next/server'

import {
  createDeploymentBasicAuthCookie,
  DEPLOYMENT_BASIC_AUTH_COOKIE,
  DEPLOYMENT_BASIC_AUTH_COOKIE_MAX_AGE,
  hasValidDeploymentBasicAuthCredentials,
  readDeploymentBasicAuthConfig,
} from '@/lib/auth/deployment-basic-auth'

export async function POST(request: Request) {
  let body: { username?: unknown; password?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Dữ liệu xác thực không hợp lệ.' }, { status: 400 })
  }

  const config = readDeploymentBasicAuthConfig()
  const username = typeof body.username === 'string' ? body.username : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!hasValidDeploymentBasicAuthCredentials(username, password, config)) {
    return NextResponse.json(
      { error: 'Tên đăng nhập hoặc mật khẩu môi trường không đúng.' },
      { status: 401, headers: { 'cache-control': 'no-store' } },
    )
  }

  const cookie = await createDeploymentBasicAuthCookie(config)
  if (!cookie) {
    return NextResponse.json({ error: 'Không thể tạo phiên truy cập môi trường.' }, { status: 500 })
  }

  const response = NextResponse.json({ data: { expiresIn: DEPLOYMENT_BASIC_AUTH_COOKIE_MAX_AGE } })
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
