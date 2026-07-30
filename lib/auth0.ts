import { Auth0Client } from '@auth0/nextjs-auth0/server'
import { NextResponse } from 'next/server'

import { Auth0EmailUnverifiedError, syncAuth0User } from '@/lib/services/user-service'

const POPUP_COMPLETE_PATH = '/auth/popup-complete'

export const auth0 = new Auth0Client({
  authorizationParameters: {
    audience: process.env.AUTH0_AUDIENCE,
    scope: 'openid profile email',
    ui_locales: 'vi',
  },
  enableAccessTokenEndpoint: true,
  onCallback: async (error, context, session) => {
    const baseUrl = context.appBaseUrl ?? process.env.APP_BASE_URL
    if (!baseUrl) throw new Error('Missing APP_BASE_URL for the Auth0 callback redirect')

    const isWindowPopup = context.returnTo?.startsWith(POPUP_COMPLETE_PATH) === true
    const errorDestination = (code: string) => {
      const destination = new URL(
        isWindowPopup ? '/auth/popup-error' : '/auth/error',
        baseUrl,
      )
      destination.searchParams.set('code', code)
      return destination
    }

    if (error || !session) {
      console.error('Auth0 callback failed', { error: error?.message ?? 'Session was not created' })
      const errorDetails = error
        ? `${error.name} ${error.message} ${String(error.cause ?? '')}`
        : ''
      const code = /blocked|unauthorized|access_denied/i.test(errorDetails)
        ? 'account_inactive'
        : 'callback_failed'
      return NextResponse.redirect(errorDestination(code))
    }

    let localUser
    try {
      const phoneNumber = session.user.phone_number
      localUser = await syncAuth0User({
        sub: session.user.sub,
        email: session.user.email,
        email_verified: session.user.email_verified,
        name: session.user.name,
        phone_number: typeof phoneNumber === 'string' ? phoneNumber : null,
      })
    } catch (syncError) {
      console.error('Auth0 user synchronization failed', {
        subject: session.user.sub,
        error: syncError instanceof Error ? syncError.message : 'Unknown sync error',
      })
      const code = syncError instanceof Auth0EmailUnverifiedError
        ? 'email_unverified'
        : 'sync_failed'
      if (code === 'email_unverified') {
        const cleanup = new URL('/auth/email-unverified', baseUrl)
        if (isWindowPopup) cleanup.searchParams.set('popup', '1')
        return NextResponse.redirect(cleanup)
      }

      return NextResponse.redirect(errorDestination(code))
    }

    if (localUser.status === 'INACTIVE') {
      return NextResponse.redirect(new URL('/auth/account-disabled', baseUrl))
    }

    if (isWindowPopup) return NextResponse.redirect(new URL(POPUP_COMPLETE_PATH, baseUrl))
    const returnTo = localUser.role === 'ADMIN' ? '/admin' : context.returnTo ?? '/'
    return NextResponse.redirect(new URL(returnTo, baseUrl))
  },
})