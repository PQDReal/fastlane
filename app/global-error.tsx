'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="vi">
      <body className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
        <main className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#836100]">Fastlane</p>
          <h1 className="mt-4 text-2xl font-bold text-slate-950">Đã xảy ra lỗi</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Hệ thống đã ghi nhận sự cố. Vui lòng thử tải lại nội dung.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 rounded-full bg-[#836100] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#6a4e00] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#836100]"
          >
            Thử lại
          </button>
        </main>
      </body>
    </html>
  )
}