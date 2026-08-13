'use client'

import { FormEvent, useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { KeyRound, Loader2, LockKeyhole } from 'lucide-react'

import { ToastViewport, type ToastMessage } from '@/components/ui/toast'
import {
  PREVIEW_AUTH_EXPIRY_STORAGE_KEY,
  PREVIEW_AUTH_RENEWED_EVENT,
} from '@/lib/auth/preview-auth-protocol'

export function PreviewAuthDialog({
  open,
  manualRetryRequired = false,
  onAuthenticated,
}: {
  open: boolean
  manualRetryRequired?: boolean
  onAuthenticated: () => void
}) {
  const titleId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', keepFocusInside)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', keepFocusInside)
      previouslyFocused?.focus()
    }
  }, [open])

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
        try {
          window.localStorage.setItem(
            PREVIEW_AUTH_EXPIRY_STORAGE_KEY,
            String(Date.now() + expiresIn * 1_000),
          )
          window.dispatchEvent(new Event(PREVIEW_AUTH_RENEWED_EVENT))
        } catch {
          // The signed HttpOnly cookie remains authoritative when storage is unavailable.
        }
      }

      setUsername('')
      setPassword('')
      setBusy(false)
      notify({
        kind: 'success',
        title: 'Xác thực thành công',
        message: manualRetryRequired
          ? 'Vui lòng thực hiện lại thao tác vừa rồi.'
          : 'Phiên truy cập đã được tiếp tục.',
      })
      onAuthenticated()
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
    <>
      <ToastViewport
        toasts={toasts}
        onClose={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))}
      />
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[9000] grid place-items-center px-4 py-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
          >
            <motion.div
              aria-hidden="true"
              className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.section
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="relative w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl sm:p-8"
            >
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                <LockKeyhole aria-hidden="true" />
              </div>
              <h1 id={titleId} className="text-2xl font-bold text-slate-950">Phiên truy cập đã hết hạn</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {manualRetryRequired
                  ? 'Nhập lại Basic Auth, sau đó thực hiện lại thao tác vừa rồi.'
                  : 'Nhập lại thông tin Basic Auth để tiếp tục.'}
              </p>
              <form onSubmit={submit} className="mt-7 grid gap-4">
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  Tên đăng nhập
                  <input autoFocus required autoComplete="username" disabled={busy} value={username} onChange={(event) => setUsername(event.target.value)} className="h-11 rounded-lg border border-slate-300 px-3 font-normal outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 disabled:opacity-60" />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
                  Mật khẩu
                  <input required type="password" autoComplete="current-password" disabled={busy} value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 rounded-lg border border-slate-300 px-3 font-normal outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 disabled:opacity-60" />
                </label>
                <button disabled={busy} className="mt-2 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 text-sm font-bold text-slate-950 transition hover:bg-amber-400 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  {busy ? 'Đang xác thực...' : 'Xác thực lại'}
                </button>
              </form>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
