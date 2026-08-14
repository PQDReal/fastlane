'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, AlertTriangle, X } from 'lucide-react'
import { useEffect, useRef } from 'react'

export type OutOfStockVariantNotice = {
  productType: 'car' | 'motorbike'
  productName: string
  versionName: string
  colorName: string
  returnHref: string
}

type OutOfStockVariantDialogProps = {
  notice: OutOfStockVariantNotice | null
  onClose: () => void
}

function productLabel(productType: OutOfStockVariantNotice['productType']) {
  return productType === 'motorbike' ? 'xe máy điện' : 'ô tô điện'
}

export function OutOfStockVariantDialog({
  notice,
  onClose,
}: OutOfStockVariantDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!notice) return

    closeButtonRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [notice, onClose])

  return (
    <AnimatePresence>
      {notice && (
        <motion.div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose()
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="out-of-stock-title"
            aria-describedby="out-of-stock-description"
            className="relative w-full max-w-md rounded-2xl border border-amber-200 bg-white p-6 shadow-2xl sm:p-7"
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                <AlertTriangle size={21} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="out-of-stock-title" className="pr-8 text-lg font-bold text-slate-950">
                  Phiên bản đã hết hàng
                </h2>
                <p id="out-of-stock-description" className="mt-2 text-sm leading-6 text-slate-600">
                  {notice.productName} · {notice.versionName} · {notice.colorName} hiện chưa có tồn kho. Vui lòng chọn cấu hình khác hoặc quay lại trang sản phẩm.
                </p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                aria-label="Đóng thông báo hết hàng"
                className="absolute ml-[-2.25rem] mt-[-0.25rem] rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-300 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                Chọn cấu hình khác
              </button>
              <a
                href={notice.returnHref}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Quay lại trang {productLabel(notice.productType)}
              </a>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
