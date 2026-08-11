'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { PreviewAuthDialog } from './preview-auth-dialog'
import {
  canReplayAfterPreviewAuth,
  isPreviewAuthRequiredResponse,
  PREVIEW_AUTH_EXPIRY_STORAGE_KEY,
  PREVIEW_AUTH_RENEWED_EVENT,
  PREVIEW_AUTH_RETRY_PATH,
  PREVIEW_AUTH_STATUS_PATH,
} from '@/lib/auth/preview-auth-protocol'

type AuthenticationGate = {
  promise: Promise<void>
  resolve: () => void
}

export function PreviewAuthExpiryGuard() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [manualRetryRequired, setManualRetryRequired] = useState(false)
  const gateRef = useRef<AuthenticationGate | null>(null)

  const requestAuthentication = useCallback((requiresManualRetry = false) => {
    try {
      window.localStorage.removeItem(PREVIEW_AUTH_EXPIRY_STORAGE_KEY)
    } catch {
      // The modal and server-side cookie validation still work without storage.
    }
    if (requiresManualRetry) setManualRetryRequired(true)
    setDialogOpen(true)
    if (!gateRef.current) {
      let resolve: () => void = () => {}
      const promise = new Promise<void>((done) => {
        resolve = done
      })
      gateRef.current = { promise, resolve }
    }
    return gateRef.current.promise
  }, [])

  const completeAuthentication = useCallback(() => {
    const gate = gateRef.current
    gateRef.current = null
    setDialogOpen(false)
    setManualRetryRequired(false)
    gate?.resolve()
  }, [])

  useEffect(() => {
    const originalFetch = window.fetch
    let expiryTimer: number | undefined

    const scheduleExpiryModal = () => {
      if (expiryTimer !== undefined) window.clearTimeout(expiryTimer)
      expiryTimer = undefined
      if (window.location.pathname === PREVIEW_AUTH_RETRY_PATH) return

      let expiresAt = 0
      try {
        expiresAt = Number(window.localStorage.getItem(PREVIEW_AUTH_EXPIRY_STORAGE_KEY))
      } catch {
        return
      }
      if (!Number.isFinite(expiresAt) || expiresAt <= 0) return
      const remaining = expiresAt - Date.now()
      if (remaining <= 0) {
        void requestAuthentication()
        return
      }
      expiryTimer = window.setTimeout(
        () => void requestAuthentication(),
        Math.min(remaining + 250, 2_147_483_647),
      )
    }

    const guardedFetch: typeof window.fetch = async (input, init) => {
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
      const canReplay = canReplayAfterPreviewAuth(method)
      const retryInput = canReplay && input instanceof Request ? input.clone() : input
      const response = await originalFetch(input, init)
      if (!isPreviewAuthRequiredResponse(response)) return response

      await requestAuthentication(!canReplay)
      if (canReplay) return originalFetch(retryInput, init)

      // Mutations are never replayed automatically because doing so could
      // duplicate an order, payment, refund, or another irreversible action.
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
      scheduleExpiryModal()
      verifySession()
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) refreshExpiryState()
    }

    window.fetch = guardedFetch
    refreshExpiryState()
    window.addEventListener('focus', refreshExpiryState)
    window.addEventListener('storage', scheduleExpiryModal)
    window.addEventListener(PREVIEW_AUTH_RENEWED_EVENT, scheduleExpiryModal)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      if (expiryTimer !== undefined) window.clearTimeout(expiryTimer)
      window.removeEventListener('focus', refreshExpiryState)
      window.removeEventListener('storage', scheduleExpiryModal)
      window.removeEventListener(PREVIEW_AUTH_RENEWED_EVENT, scheduleExpiryModal)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (window.fetch === guardedFetch) window.fetch = originalFetch
    }
  }, [requestAuthentication])

  return (
    <PreviewAuthDialog
      open={dialogOpen}
      manualRetryRequired={manualRetryRequired}
      onAuthenticated={completeAuthentication}
    />
  )
}
