'use client'

import { FormEvent, useState } from 'react'
import { KeyRound, Loader2, LockKeyhole } from 'lucide-react'
import { motion } from 'framer-motion'

import { ToastViewport, type ToastMessage } from '@/components/ui/toast'
import { PREVIEW_AUTH_EXPIRY_STORAGE_KEY } from '@/lib/auth/preview-auth-protocol'

export function PreviewAuthForm({ returnTo }: { returnTo: string }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const notify = (toast: Omit<ToastMessage, 'id'>) => {
    setToasts((current) => [...current, { id: Date.now(), ...toast }])
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const response = await fetch('/api/preview-auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Không thể xác thực môi trường.')
      const expiresIn = Number(payload?.data?.expiresIn)
      if (Number.isFinite(expiresIn) && expiresIn > 0) {
        window.localStorage.setItem(
          PREVIEW_AUTH_EXPIRY_STORAGE_KEY,
          String(Date.now() + expiresIn * 1_000),
        )
      }
      notify({ kind: 'success', title: 'Xác thực thành công', message: 'Đang quay lại trang trước đó.' })
      window.setTimeout(() => window.location.replace(returnTo), 450)
    } catch (error) {
      notify({
        kind: 'error',
        title: 'Xác thực thất bại',
        message: error instanceof Error ? error.message : 'Vui lòng thử lại.',
      })
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-4 py-10">
      <ToastViewport toasts={toasts} onClose={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
      <motion.section
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-auth-title"
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl sm:p-8"
      >
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600"><LockKeyhole aria-hidden="true" /></div>
        <h1 id="preview-auth-title" className="text-2xl font-bold text-slate-950">Phiên truy cập đã hết hạn</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Nhập lại thông tin Basic Auth để tiếp tục. Phiên đăng nhập Auth0 của bạn vẫn được giữ nguyên.</p>
        <form onSubmit={submit} className="mt-7 grid gap-4">
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Tên đăng nhập<input autoFocus required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} className="h-11 rounded-lg border border-slate-300 px-3 font-normal outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20" /></label>
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700">Mật khẩu<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 rounded-lg border border-slate-300 px-3 font-normal outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20" /></label>
          <button disabled={busy} className="mt-2 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 text-sm font-bold text-slate-950 transition hover:bg-amber-400 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {busy ? 'Đang xác thực...' : 'Xác thực lại'}
          </button>
        </form>
      </motion.section>
    </main>
  )
}
