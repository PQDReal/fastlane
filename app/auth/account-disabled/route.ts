import { type NextRequest, NextResponse } from 'next/server'

export function GET(request: NextRequest) {
  const message = {
    type: 'auth_complete',
    success: false,
    error: { code: 'account_inactive' },
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>FASTLANE</title></head><body><script>window.opener?.postMessage(${JSON.stringify(message)},${JSON.stringify(request.nextUrl.origin)});window.close();</script></body></html>`
  const response = new NextResponse(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  })

  for (const cookie of request.cookies.getAll()) {
    if (
      cookie.name === '__session' ||
      cookie.name.startsWith('__session_') ||
      cookie.name === 'appSession' ||
      cookie.name.startsWith('appSession.') ||
      cookie.name.startsWith('__FC_')
    ) {
      response.cookies.set(cookie.name, '', {
        expires: new Date(0),
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      })
    }
  }

  return response
}