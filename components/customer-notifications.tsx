'use client'

import { Bell, CheckCheck, LoaderCircle, PackageCheck } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { ToastViewport, type ToastMessage } from '@/components/ui/toast'
import type {
  CustomerNotification,
  CustomerNotificationsResponse,
} from '@/lib/notifications/types'

const REFRESH_INTERVAL_MS = 30_000
const CHANNEL_NAME = 'fastlane:customer-notifications'

function relativeTime(value: string) {
  const elapsed = new Date(value).getTime() - Date.now()
  const formatter = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' })
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ]

  for (const [unit, duration] of units) {
    if (Math.abs(elapsed) >= duration) return formatter.format(Math.round(elapsed / duration), unit)
  }
  return 'vừa xong'
}

export function CustomerNotifications({ userSubject }: { userSubject: string }) {
  const router = useRouter()
  const rootRef = useRef<HTMLDivElement>(null)
  const requestRef = useRef<AbortController | null>(null)
  const [isCustomer, setIsCustomer] = useState(false)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<CustomerNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const showError = useCallback((title: string, message?: string) => {
    setToasts((current) => [...current, { id: Date.now(), kind: 'error', title, message }])
  }, [])

  const refresh = useCallback(async (quiet = false) => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    if (!quiet) setLoading(true)

    try {
      const response = await fetch('/api/v1/notifications?limit=20', {
        cache: 'no-store',
        signal: controller.signal,
      })
      if (response.status === 401 || response.status === 403) {
        setIsCustomer(false)
        return
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = await response.json() as CustomerNotificationsResponse
      setItems(payload.data.items)
      setUnreadCount(payload.data.unreadCount)
      setIsCustomer(true)
    } catch (error) {
      if ((error as Error).name !== 'AbortError' && !quiet) {
        showError('Không tải được thông báo', 'Vui lòng thử lại sau.')
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
        setLoading(false)
      }
    }
  }, [showError])

  useEffect(() => {
    void refresh()
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME)
    const sync = () => {
      if (document.visibilityState === 'visible') void refresh(true)
    }
    channel?.addEventListener('message', sync)
    document.addEventListener('visibilitychange', sync)
    const interval = window.setInterval(sync, REFRESH_INTERVAL_MS)
    return () => {
      requestRef.current?.abort()
      channel?.close()
      document.removeEventListener('visibilitychange', sync)
      window.clearInterval(interval)
    }
  }, [refresh, userSubject])

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const notifyOtherTabs = () => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(CHANNEL_NAME)
    channel.postMessage({ type: 'refresh' })
    channel.close()
  }

  const markAllRead = async () => {
    const previousItems = items
    const previousCount = unreadCount
    const readAt = new Date().toISOString()
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? readAt })))
    setUnreadCount(0)
    try {
      const response = await fetch('/api/v1/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'READ_ALL' }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      notifyOtherTabs()
    } catch {
      setItems(previousItems)
      setUnreadCount(previousCount)
      showError('Chưa thể đánh dấu đã đọc', 'Vui lòng thử lại.')
    }
  }

  const openNotification = async (notification: CustomerNotification) => {
    if (!notification.readAt) {
      const readAt = new Date().toISOString()
      setItems((current) => current.map((item) => item.id === notification.id ? { ...item, readAt } : item))
      setUnreadCount((count) => Math.max(0, count - 1))
      void fetch(`/api/v1/notifications/${notification.id}/read`, { method: 'PATCH' })
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          notifyOtherTabs()
        })
        .catch(() => {
          void refresh(true)
          showError('Chưa thể cập nhật thông báo', 'Trạng thái sẽ được đồng bộ lại.')
        })
    }
    setOpen(false)
    router.push(notification.actionUrl)
  }

  if (!isCustomer && !loading) return <ToastViewport toasts={toasts} onClose={(id) => setToasts((all) => all.filter((toast) => toast.id !== id))} />
  if (!isCustomer) return null

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={unreadCount ? `Thông báo, ${unreadCount} chưa đọc` : 'Thông báo'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative block rounded-full p-1 transition hover:opacity-70 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e19200] focus-visible:ring-offset-2"
      >
        <Bell size={23} strokeWidth={2} />
        <AnimatePresence initial={false}>
          {unreadCount > 0 && (
            <motion.span
              initial={{ opacity: 0, scale: 0.3 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.3 }}
              className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Thông báo của bạn"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="fixed left-3 right-3 top-[70px] z-[60] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+12px)] sm:w-[390px]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="font-semibold">Thông báo</h2>
                <p className="text-xs text-slate-500">Cập nhật trạng thái đơn hàng</p>
              </div>
              {unreadCount > 0 && (
                <button type="button" onClick={() => void markAllRead()} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#9b7200] transition hover:bg-amber-50 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e19200]">
                  <CheckCheck size={15} /> Đọc tất cả
                </button>
              )}
            </div>

            <div className="max-h-[min(65vh,480px)] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={18} /> Đang tải...</div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center px-5 py-12 text-center"><PackageCheck className="mb-3 text-[#e19200]" size={34} /><p className="font-medium">Chưa có thông báo</p><p className="mt-1 text-sm text-slate-500">Thay đổi trạng thái đơn hàng sẽ xuất hiện tại đây.</p></div>
              ) : items.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => void openNotification(notification)}
                  className={`relative block w-full border-b border-slate-100 px-4 py-3 text-left transition last:border-0 hover:bg-amber-50/60 active:scale-[0.99] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#e19200] ${notification.readAt ? 'bg-white' : 'bg-amber-50/40'}`}
                >
                  {!notification.readAt && <span className="absolute right-4 top-4 h-2 w-2 rounded-full bg-[#e19200]" />}
                  <p className="pr-5 text-sm font-semibold text-slate-900">{notification.title}</p>
                  <p className="mt-1 pr-3 text-sm leading-5 text-slate-600">{notification.message}</p>
                  <p className="mt-1.5 text-xs font-medium text-[#9b7200]">{relativeTime(notification.createdAt)}</p>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <ToastViewport toasts={toasts} onClose={(id) => setToasts((all) => all.filter((toast) => toast.id !== id))} />
    </div>
  )
}
