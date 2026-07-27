'use client'

import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@auth0/nextjs-auth0/client'
import { getMyProfile } from '@/lib/api/profile-client'

type Props = { children: ReactNode; className?: string; onSuccess?: () => void }
type AuthCompleteMessage = { type: 'auth_complete'; success: boolean; error?: { code?: string; message?: string } }
const POPUP_NAME = 'fastlane-auth0-login'

export function PopupLoginButton({ children, className, onSuccess }: Props) {
  const router = useRouter()
  const { invalidate } = useUser()
  const popupRef = useRef<Window | null>(null)

  const finish = useCallback(async () => {
    await invalidate()
    try {
      const profile = await getMyProfile()
      if (profile.role.toUpperCase() === 'ADMIN') {
        window.location.assign('/admin')
        return
      }
    } catch {
      // The callback has already validated the account. Refresh handles any short session propagation delay.
    }
    router.refresh()
    onSuccess?.()
  }, [invalidate, onSuccess, router])

  useEffect(() => {
    function receive(event: MessageEvent<AuthCompleteMessage>) {
      if (event.origin !== window.location.origin || event.source !== popupRef.current || event.data?.type !== 'auth_complete') return
      if (event.data.success) {
        popupRef.current = null
        void finish()
      } else {
        popupRef.current = null
        const code = event.data.error?.code ?? 'callback_failed'
        window.location.assign(`/auth/error?code=${encodeURIComponent(code)}`)
      }
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [finish])

  function login() {
    const width = 520
    const height = 720
    const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2)
    const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2)
    popupRef.current = window.open('/auth/login?returnTo=%2Fauth%2Fpopup-complete', POPUP_NAME, `popup=yes,width=${width},height=${height},left=${left},top=${top}`)
    if (!popupRef.current) window.location.assign('/auth/error?code=popup_blocked')
    else popupRef.current.focus()
  }

  return <button type="button" onClick={login} className={className}>{children}</button>
}