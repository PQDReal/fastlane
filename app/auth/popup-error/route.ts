import { type NextRequest, NextResponse } from 'next/server'

const allowedCodes = new Set([
  'account_inactive',
  'callback_failed',
  'sync_failed',
])

export function GET(request: NextRequest) {
  const requestedCode = request.nextUrl.searchParams.get('code')
  const code =
    requestedCode && allowedCodes.has(requestedCode)
      ? requestedCode
      : 'callback_failed'
  const message = {
    type: 'auth_complete',
    success: false,
    error: { code },
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>FASTLANE</title></head><body><script>window.opener?.postMessage(${JSON.stringify(message)},${JSON.stringify(request.nextUrl.origin)});window.close();</script></body></html>`

  return new NextResponse(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
