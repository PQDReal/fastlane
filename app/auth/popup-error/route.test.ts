import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'

import { GET } from './route'

describe('popup authentication error', () => {
  it('preserves the authorization denial code for the parent window', async () => {
    const response = GET(
      new NextRequest(
        'http://localhost:3000/auth/popup-error?code=authorization_denied',
      ),
    )
    const html = await response.text()

    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(html).toContain('"code":"authorization_denied"')
    expect(html).toContain('window.opener?.postMessage')
  })

  it('replaces unknown error codes with the safe callback error', async () => {
    const response = GET(
      new NextRequest('http://localhost:3000/auth/popup-error?code=unknown'),
    )

    expect(await response.text()).toContain('"code":"callback_failed"')
  })
})
