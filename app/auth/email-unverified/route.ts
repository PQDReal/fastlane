import { type NextRequest, NextResponse } from 'next/server'

export function GET(request: NextRequest) {
  const isPopup = request.nextUrl.searchParams.get('popup') === '1'
  const destination = new URL(
    isPopup
      ? '/auth/popup-error?code=email_unverified'
      : '/auth/error?code=email_unverified',
    request.nextUrl.origin,
  )
  const response = NextResponse.redirect(destination)

  // Auth0 saves the callback session after onCallback returns. This follow-up
  // route removes it before showing the verification-required error page.
  const sessionCookieNames = request.cookies
    .getAll()
    .map((cookie) => cookie.name)
    .filter((name) =>
      name === '__session' ||
      /^__session__\d+$/.test(name) ||
      name === 'appSession' ||
      /^appSession\.\d+$/.test(name) ||
      name.startsWith('__FC'),
    )

  // Delete the base name as well, including when this request only has chunks.
  for (const name of new Set(['__session', ...sessionCookieNames])) {
    response.cookies.delete({ name, path: '/' })
  }
  return response
}