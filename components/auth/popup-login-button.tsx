'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@auth0/nextjs-auth0/client'
import { getMyProfile } from '@/lib/api/profile-client'
import { ToastViewport, type ToastMessage } from '@/components/ui/toast'

type Props = { children: ReactNode; className?: string; onSuccess?: () => void; forceLogin?: boolean }
type AuthCompleteMessage = { type: 'auth_complete'; success: boolean; error?: { code?: string; message?: string } }
const POPUP_NAME = 'fastlane-auth0-login'

export function PopupLoginButton({ children, className, onSuccess, forceLogin = false }: Props) {
  const router = useRouter()
  const { invalidate } = useUser()
  const popupRef = useRef<Window | null>(null)
  const [toasts, setToasts] = useState<ToastMessage[]>([])

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
        const id = Date.now()
        const content = code === 'email_unverified'
          ? { title: 'Email chưa được xác thực', message: 'Vui lòng xác thực email hoặc đăng nhập bằng tài khoản khác.' }
          : code === 'account_inactive'
            ? { title: 'Tài khoản đã bị vô hiệu hóa', message: 'Vui lòng liên hệ quản trị viên để được hỗ trợ.' }
            : { title: 'Đăng nhập không thành công', message: event.data.error?.message || 'Vui lòng thử đăng nhập lại.' }
        setToasts((current) => [...current, { id, kind: 'error', ...content }])
        window.setTimeout(() => {
          setToasts((current) => current.filter((toast) => toast.id !== id))
        }, 4500)
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
    const forceNextLogin = document.cookie
      .split(';')
      .some((cookie) => cookie.trim() === 'fastlane_force_login=1')
    if (forceNextLogin) {
      document.cookie = 'fastlane_force_login=; Path=/; Max-Age=0; SameSite=Lax'
    }
    const loginUrl = forceLogin || forceNextLogin
      ? '/auth/login?returnTo=%2Fauth%2Fpopup-complete&prompt=login'
      : '/auth/login?returnTo=%2Fauth%2Fpopup-complete'
    popupRef.current = window.open(loginUrl, POPUP_NAME, `popup=yes,width=${width},height=${height},left=${left},top=${top}`)
    if (!popupRef.current) window.location.assign('/auth/error?code=popup_blocked')
    else popupRef.current.focus()
  }

  return (
    <>
      <ToastViewport
        toasts={toasts}
        onClose={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))}
      />
      <button type="button" onClick={login} className={className}>{children}</button>
    </>
  )
}