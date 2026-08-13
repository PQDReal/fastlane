import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, Check, Loader2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'

export type ProductReviewBlocker = {
  stepLabel: string
  message: string
}

export function ProductReviewDecisionDialog({
  open,
  blockers,
  triggerRef,
  onClose,
  onSaveDraft,
  onPublish,
  mode = 'create',
  saving = false,
}: {
  open: boolean
  blockers: ProductReviewBlocker[]
  triggerRef: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
  onSaveDraft?: () => void
  onPublish: () => void
  mode?: 'create' | 'edit'
  saving?: boolean
}) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => closeRef.current?.focus(), 80)
    return () => window.clearTimeout(timer)
  }, [open])

  function close() {
    if (saving) return
    onClose()
    window.setTimeout(() => triggerRef.current?.focus(), 0)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}
          onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}
          onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}
        >
          <motion.div role="dialog" aria-modal="true" aria-labelledby="review-decision-title" aria-describedby="review-decision-description" className="w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-2xl" initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.985 }} transition={{ type: 'spring', stiffness: 430, damping: 34 }}>
            <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Check size={18} /></div>
              <div className="min-w-0 flex-1"><h2 id="review-decision-title" className="text-base font-bold text-slate-950">{mode === 'edit' ? 'Lưu thay đổi sản phẩm' : 'Đăng sản phẩm phụ kiện'}</h2><p id="review-decision-description" className="mt-1 text-sm leading-5 text-slate-500">{mode === 'edit' ? 'Toàn bộ thông tin phụ kiện sẽ được cập nhật trong một giao dịch.' : 'Sản phẩm, SKU, tùy chọn và hình ảnh sẽ được ghi đồng bộ vào hệ thống.'}</p></div>
              <button ref={closeRef} type="button" aria-label="Đóng duyệt sản phẩm" onClick={close} disabled={saving} className="rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50"><X size={18} /></button>
            </div>
            <div className="p-5">
              {blockers.length > 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <div className="flex gap-3"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-bold">Sản phẩm chưa hoàn chỉnh</p><p className="mt-1 leading-5">{mode === 'create' ? 'Bạn vẫn có thể lưu cục bộ và hoàn thiện sau.' : 'Hãy hoàn thiện các mục bên dưới trước khi lưu.'}</p></div></div>
                  <ul className="mt-3 space-y-1.5 border-t border-amber-200 pt-3">{blockers.map((blocker) => <li key={`${blocker.stepLabel}-${blocker.message}`}><strong>{blocker.stepLabel}:</strong> {blocker.message}</li>)}</ul>
                </div>
              ) : (
                <div className="flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><Check className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-bold">Sản phẩm đã sẵn sàng</p><p className="mt-1 leading-5">Thông tin bắt buộc đã đầy đủ để ghi vào hệ thống.</p></div></div>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={close} disabled={saving}>Quay lại kiểm tra</Button>
              {onSaveDraft && <Button type="button" variant="outline" onClick={onSaveDraft} disabled={saving}>Lưu phiên làm việc</Button>}
              <Button type="button" disabled={blockers.length > 0 || saving} onClick={onPublish} className="bg-brand-600 hover:bg-brand-700">{saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Check size={16} className="mr-2" />}{mode === 'edit' ? 'Lưu thay đổi' : 'Đăng sản phẩm'}</Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
