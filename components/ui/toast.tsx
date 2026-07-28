'use client'

import { AlertTriangle, CheckCircle2, CircleAlert, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

export type ToastKind = 'success' | 'error' | 'warning'
export type ToastAction = { label: string; onClick: () => void; variant?: 'default' | 'danger' }
export type ToastMessage = {
  id: number
  kind: ToastKind
  title: string
  message?: string
  action?: ToastAction
  secondaryAction?: ToastAction
}

const styles: Record<ToastKind, { box: string; Icon: typeof CheckCircle2; iconColor: string; titleColor: string; msgColor: string; closeColor: string; closeHover: string }> = {
  success: { box: 'border-emerald-500 bg-emerald-600 shadow-emerald-900/20', Icon: CheckCircle2, iconColor: 'text-white', titleColor: 'text-white', msgColor: 'text-white/85', closeColor: 'text-white/75', closeHover: 'hover:bg-white/15 hover:text-white' },
  error: { box: 'border-red-500 bg-red-600 shadow-red-900/20', Icon: CircleAlert, iconColor: 'text-white', titleColor: 'text-white', msgColor: 'text-white/85', closeColor: 'text-white/75', closeHover: 'hover:bg-white/15 hover:text-white' },
  warning: { box: 'border-amber-400 bg-white shadow-amber-900/10', Icon: AlertTriangle, iconColor: 'text-amber-500', titleColor: 'text-slate-900', msgColor: 'text-slate-600', closeColor: 'text-slate-400', closeHover: 'hover:bg-slate-100 hover:text-slate-900' },
}

function ActionButton({ action }: { action: ToastAction }) {
  const style = action.variant === 'danger'
    ? 'bg-white text-red-700 hover:bg-red-50'
    : 'border border-white/40 bg-white/10 text-white hover:bg-white/20'

  return <button type="button" onClick={action.onClick} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${style}`}>{action.label}</button>
}

export function ToastViewport({ toasts, onClose }: { toasts: ToastMessage[]; onClose: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[70] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3" aria-live="polite" aria-atomic="false">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const { box, Icon, iconColor, titleColor, msgColor, closeColor, closeHover } = styles[toast.kind]
          return (
            <motion.div
              layout="position"
              key={toast.id}
              initial={{ opacity: 0, x: 28, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 28, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              role={toast.kind === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-xl ${box}`}
            >
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconColor}`} />
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold ${titleColor}`}>{toast.title}</p>
                {toast.message && <p className={`mt-1 text-sm leading-5 ${msgColor}`}>{toast.message}</p>}
                {(toast.action || toast.secondaryAction) && (
                  <div className="mt-3 flex justify-end gap-2">
                    {toast.secondaryAction && <ActionButton action={toast.secondaryAction} />}
                    {toast.action && <ActionButton action={toast.action} />}
                  </div>
                )}
              </div>
              <button type="button" onClick={() => onClose(toast.id)} className={`rounded p-1 transition-colors ${closeColor} ${closeHover}`} aria-label="Close notification"><X size={16} /></button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}