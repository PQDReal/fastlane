'use client'

import { RotateCcw, Undo2 } from 'lucide-react'
import Link from 'next/link'

import { PopupLoginButton } from '@/components/auth/popup-login-button'

export function AuthErrorActions({
  canRetry,
  retryLabel = 'Thử đăng nhập lại',
  forceLogin = false,
}: {
  canRetry: boolean
  retryLabel?: string
  forceLogin?: boolean
}) {
  return (
    <div className="mt-8 grid gap-3">
      {canRetry && (
        <PopupLoginButton
          forceFreshLogin
          onSuccess={() => window.location.assign('/')}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
        >
          <RotateCcw size={17} aria-hidden="true" />
          {retryLabel}
        </PopupLoginButton>
      )}
      <Link
        href="/"
        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
      >
        <Undo2 size={17} aria-hidden="true" />
        Về trang chủ
      </Link>
    </div>
  )
}
