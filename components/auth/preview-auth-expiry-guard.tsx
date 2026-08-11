'use client'

import { useEffect } from 'react'

import {
  createPreviewAuthRetryHref,
  isPreviewAuthRequiredResponse,
  PREVIEW_AUTH_EXPIRY_STORAGE_KEY,
  PREVIEW_AUTH_RETRY_PATH,
  PREVIEW_AUTH_STATUS_PATH,
} from '@/lib/auth/preview-auth-protocol'

export function PreviewAuthExpiryGuard() {
  useEffect(() => {
    const originalFetch = window.fetch
    let redirecting = false
    let expiryTimer: number | undefined

    const redirectToAuthentication = () => {
      if (redirecting || window.location.pathname === PREVIEW_AUTH_RETRY_PATH) return
      redirecting = true
      window.localStorage.removeItem(PREVIEW_AUTH_EXPIRY_STORAGE_KEY)
      window.location.replace(createPreviewAuthRetryHref(window.location))
    }

    const scheduleExpiryRedirect = () => {
      if (expiryTimer !== undefined) window.clearTimeout(expiryTimer)
      expiryTimer = undefined
      if (window.location.pathname === PREVIEW_AUTH_RETRY_PATH) return

      const expiresAt = Number(window.localStorage.getItem(PREVIEW_AUTH_EXPIRY_STORAGE_KEY))
      if (!Number.isFinite(expiresAt) || expiresAt <= 0) return
      const remaining = expiresAt - Date.now()
      if (remaining <= 0) {
        redirectToAuthentication()
        return
      }
      expiryTimer = window.setTimeout(
        redirectToAuthentication,
        Math.min(remaining + 250, 2_147_483_647),
      )
    }

    const guardedFetch: typeof window.fetch = async (...args) => {
      const response = await originalFetch(...args)
      if (!redirecting && isPreviewAuthRequiredResponse(response)) {
        redirectToAuthentication()

        // Do not let the caller show a misleading operation error while the
        // browser is leaving this page for the environment login form.
        return new Promise<Response>(() => undefined)
      }
      return response
    }

    const verifySession = () => {
      if (window.location.pathname === PREVIEW_AUTH_RETRY_PATH) return
      void guardedFetch(PREVIEW_AUTH_STATUS_PATH, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      }).catch(() => undefined)
    }

    const refreshExpiryState = () => {
      scheduleExpiryRedirect()
      verifySession()
    }

    window.fetch = guardedFetch
    refreshExpiryState()
    window.addEventListener('focus', refreshExpiryState)
    window.addEventListener('storage', scheduleExpiryRedirect)
    document.addEventListener('visibilitychange', scheduleExpiryRedirect)
    return () => {
      if (expiryTimer !== undefined) window.clearTimeout(expiryTimer)
      window.removeEventListener('focus', refreshExpiryState)
      window.removeEventListener('storage', scheduleExpiryRedirect)
      document.removeEventListener('visibilitychange', scheduleExpiryRedirect)
      if (window.fetch === guardedFetch) window.fetch = originalFetch
    }
  }, [])

  return null
}
