import { Auth0Client } from '@auth0/nextjs-auth0/server'
import { NextResponse } from 'next/server'

import { syncAuth0User } from '@/lib/services/user-service'

export const auth0 = new Auth0Client({
  authorizationParameters: {
    audience: process.env.AUTH0_AUDIENCE,
    scope: 'openid profile email',
  },
  // FastLane uses the SDK as a token-mediating BFF. Browser code never receives
  // an API access token from the SDK's convenience endpoint.
  enableAccessTokenEndpoint: false,
  onCallback: async (error, context, session) => {
    const baseUrl = context.appBaseUrl ?? process.env.APP_BASE_URL

    if (!baseUrl) {
      throw new Error('Missing APP_BASE_URL for the Auth0 callback redirect')
    }

    if (error || !session) {
      console.error('Auth0 callback failed', {
        error: error?.message ?? 'Session was not created',
      })

      const destination = new URL('/', baseUrl)
      destination.searchParams.set('auth_error', 'callback_failed')
      return NextResponse.redirect(destination)
    }

    try {
      const phoneNumber = session.user.phone_number

      await syncAuth0User({
        sub: session.user.sub,
        email: session.user.email,
        name: session.user.name,
        phone_number: typeof phoneNumber === 'string' ? phoneNumber : null,
      })
    } catch (syncError) {
      console.error('Auth0 user synchronization failed', {
        subject: session.user.sub,
        error:
          syncError instanceof Error ? syncError.message : 'Unknown sync error',
      })

      const destination = new URL('/', baseUrl)
      destination.searchParams.set('auth_sync', 'failed')
      return NextResponse.redirect(destination)
    }

    return NextResponse.redirect(new URL(context.returnTo ?? '/', baseUrl))
  },
})