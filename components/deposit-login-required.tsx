'use client'

import Link from 'next/link'
import { LogIn, Undo2 } from 'lucide-react'

import { PopupLoginButton } from '@/components/auth/popup-login-button'

export function DepositLoginRequired() {
  return (
    <main className="fixed inset-0 z-[100] flex items-center justify-center bg-white/55 px-5 py-10 backdrop-blur-md">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="deposit-login-title"
        className="relative z-10 w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-2xl sm:p-9"
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <LogIn size={30} aria-hidden="true" />
        </div>
        <h1 id="deposit-login-title" className="mt-6 text-2xl font-bold text-slate-950">
          Vui lòng đăng nhập
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Bạn cần đăng nhập tài khoản FastLane trước khi tiếp tục đặt cọc xe.
        </p>
        <div className="mt-8 grid gap-3">
          <PopupLoginButton
            forceFreshLogin
            onSuccess={() => window.location.reload()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            <LogIn size={17} aria-hidden="true" />
            Đăng nhập để tiếp tục
          </PopupLoginButton>
          <Link
            href="/"
            onClick={() => window.dispatchEvent(new Event('fastlane:close-deposit-login'))}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Undo2 size={17} aria-hidden="true" />
            Về trang chủ
          </Link>
        </div>
      </section>
    </main>
  )
}
