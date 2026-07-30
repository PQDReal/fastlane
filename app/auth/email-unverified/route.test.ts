import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'

import { GET } from './route'

describe('email-unverified session cleanup', () => {
  it('deletes the Auth0 session before redirecting the popup to its error route', () => {
    const response = GET(new NextRequest(
      'http://localhost:3000/auth/email-unverified?popup=1',
      { headers: { cookie: '__session__0=part-a; __session__1=part-b; appSession.0=legacy; __FC_google=token' } },
    ))

    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/auth/popup-error?code=email_unverified',
    )
    const deletedCookies = response.headers.get('set-cookie') ?? ''
    for (const name of ['__session', '__session__0', '__session__1', 'appSession.0', '__FC_google']) {
      expect(deletedCookies).toContain(name + '=')
    }
    expect(deletedCookies).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
  })
})