import { describe, expect, it } from 'vitest'

import { scrubSentryEvent, sentrySampleRate } from './sentry-config'

describe('Sentry privacy configuration', () => {
  it('removes credentials, request content and URL parameters', () => {
    const event = scrubSentryEvent({
      type: undefined,
      request: {
        cookies: { session: 'secret-cookie' },
        data: { password: 'secret-password' },
        headers: {
          authorization: 'Bearer secret-token',
          cookie: 'session=secret-cookie',
          accept: 'application/json',
        },
        query_string: 'code=auth-code&state=secret-state',
        url: 'https://fastlane.example/auth/callback?code=auth-code',
      },
      user: {
        id: 'user-1',
        email: 'customer@example.com',
        ip_address: '127.0.0.1',
      },
    }, {})

    expect(event.request).toEqual({
      cookies: undefined,
      data: undefined,
      headers: { accept: 'application/json' },
      query_string: undefined,
      url: 'https://fastlane.example/auth/callback',
    })
    expect(event.user).toEqual({ id: 'user-1' })
  })

  it('accepts only sample rates between zero and one', () => {
    expect(sentrySampleRate('0.25', 0.1)).toBe(0.25)
    expect(sentrySampleRate('2', 0.1)).toBe(0.1)
    expect(sentrySampleRate('invalid', 0.1)).toBe(0.1)
  })
})