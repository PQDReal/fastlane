import Link from 'next/link'
import { ShieldX } from 'lucide-react'

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-12">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <ShieldX aria-hidden="true" size={32} />
        </span>
        <p className="mt-7 text-sm font-bold uppercase tracking-[0.2em] text-red-600">
          Lỗi 403
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
          Không có quyền truy cập
        </h1>
        <p className="mt-4 text-slate-600">
          Tài khoản của bạn không có quyền quản trị hệ thống FASTLANE.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="rounded-full bg-slate-950 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-slate-800"
          >
            Về trang chủ
          </Link>
          <a
            href="/auth/logout"
            className="rounded-full border border-slate-300 px-6 py-3 text-sm font-bold text-slate-800 transition-colors hover:bg-slate-100"
          >
            Đăng xuất
          </a>
        </div>
      </section>
    </main>
  )
}