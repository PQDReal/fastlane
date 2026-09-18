'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { PackagePlus, X } from 'lucide-react'

import { AccessoryProductCreateDialog } from '@/components/admin/accessory-product-create-dialog'
import { CarProductCreateDialog } from '@/components/admin/car-product-create-dialog'
import { ToastViewport, type ToastKind, type ToastMessage } from '@/components/ui/toast'
import type { AdminRootCategory } from '@/lib/catalog/admin-accessory-draft'
import type { CatalogServiceLabel } from '@/lib/catalog/service-labels'
import type { AdminAccessoryTemplate } from '@/lib/catalog/admin-accessory-template-types'
import type {
  AdminAccessoryEditorData,
  AdminAccessorySaveResult,
} from '@/lib/catalog/admin-accessory-write'
import { ProductTypePicker } from './product-type-picker'
import { productWorkflowCapability } from './workflow-contract'

export function ProductCreateDialog({
  open,
  categories,
  serviceLabels,
  accessoryTemplates,
  onClose,
  onAfterClose,
  onSaved,
  initialAccessory,
}: {
  open: boolean
  categories: AdminRootCategory[]
  serviceLabels: CatalogServiceLabel[]
  accessoryTemplates: AdminAccessoryTemplate[]
  onClose: () => void
  onAfterClose?: () => void
  onSaved: (result: AdminAccessorySaveResult) => void
  initialAccessory?: AdminAccessoryEditorData
}) {
  const [selectedCategory, setSelectedCategory] = useState<AdminRootCategory | null>(null)
  const [workflowDirty, setWorkflowDirty] = useState(false)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const closeRef = useRef<HTMLButtonElement>(null)
  const openRef = useRef(open)
  const editingCategory = initialAccessory
    ? categories.find((category) => category.id === initialAccessory.draft.rootCategoryId) ?? {
      id: initialAccessory.draft.rootCategoryId,
      name: 'Phụ kiện',
      slug: 'phu-kien',
      isActive: true,
    }
    : null
  const activeCategory = editingCategory ?? selectedCategory

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const notifyWorkflow = useCallback((kind: ToastKind, title: string, message?: string) => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { id, kind, title, message }])
    window.setTimeout(() => dismissToast(id), 4200)
  }, [dismissToast])

  const confirmWorkflow = useCallback((title: string, message: string, onConfirm: () => void, confirmLabel = 'Tiếp tục') => {
    const id = Date.now() + Math.random()
    const closeWarning = () => dismissToast(id)
    setToasts((current) => {
      if (current.some((toast) => toast.kind === 'warning' && toast.title === title)) return current
      return [
        ...current,
        {
          id,
          kind: 'warning',
          title,
          message,
          secondaryAction: { label: 'Giữ lại', onClick: closeWarning },
          action: {
            label: confirmLabel,
            variant: 'danger',
            onClick: () => {
              closeWarning()
              onConfirm()
            },
          },
        },
      ]
    })
  }, [dismissToast])

  useEffect(() => {
    if (!open) return

    const root = document.documentElement
    const body = document.body
    const previousRootOverflow = root.style.overflow
    const previousRootOverscroll = root.style.overscrollBehavior
    const previousBodyOverflow = body.style.overflow
    const previousBodyOverscroll = body.style.overscrollBehavior

    root.style.overflow = 'hidden'
    root.style.overscrollBehavior = 'none'
    body.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'none'

    return () => {
      root.style.overflow = previousRootOverflow
      root.style.overscrollBehavior = previousRootOverscroll
      body.style.overflow = previousBodyOverflow
      body.style.overscrollBehavior = previousBodyOverscroll
    }
  }, [open])

  useEffect(() => {
    openRef.current = open
  }, [open])

  const finishClose = useCallback(() => {
    if (openRef.current) return
    setSelectedCategory(null)
    setWorkflowDirty(false)
    setToasts([])
    onAfterClose?.()
  }, [onAfterClose])

  useEffect(() => {
    if (!open || activeCategory) return
    const timer = window.setTimeout(() => closeRef.current?.focus(), 80)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [activeCategory, onClose, open])

  function selectCategory(category: AdminRootCategory) {
    const capability = productWorkflowCapability(category)
    if (capability.workflow === 'accessory') {
      setWorkflowDirty(false)
      setSelectedCategory(category)
    } else if (capability.workflow === 'motorbike') {
      onClose()
      window.location.href = '/admin/products/motorbikes/new'
    } else if (capability.workflow === 'car') {
      onClose()
      window.location.href = '/admin/products/cars/new'
    }
  }

  function returnToTypePicker() {
    setWorkflowDirty(false)
    setSelectedCategory(null)
  }

  function requestChangeType() {
    if (!workflowDirty) {
      returnToTypePicker()
      return
    }

    confirmWorkflow(
      'Đổi loại sản phẩm?',
      'Thông tin sản phẩm đã nhập sẽ bị xóa.',
      returnToTypePicker,
      'Xóa và đổi loại',
    )
  }

  const requestClose = useCallback(() => {
    if (!workflowDirty) {
      onClose()
      return
    }

    confirmWorkflow(
      'Thoát trình tạo sản phẩm?',
      'Thông tin phụ kiện bạn đã nhập sẽ bị mất nếu chưa lưu bản nháp.',
      onClose,
      'Thoát và bỏ thay đổi',
    )
  }, [confirmWorkflow, onClose, workflowDirty])

  return (
    <>
      <ToastViewport toasts={toasts} onClose={dismissToast} />

      <AnimatePresence onExitComplete={finishClose}>
        {open && !activeCategory && (
          <motion.div className="fixed inset-0 z-50 !m-0 flex overscroll-none bg-white" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <motion.div role="dialog" aria-modal="true" aria-labelledby="create-product-title" className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-white" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
              <header className="flex items-center gap-4 border-b border-slate-200 px-4 py-3 sm:px-6">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-950 text-white"><PackagePlus size={19} /></div>
                <div className="min-w-0 flex-1"><h2 id="create-product-title" className="text-lg font-bold text-slate-950">Thêm sản phẩm</h2><p className="text-xs text-slate-500">Chọn loại sản phẩm để bắt đầu</p></div>
                <button ref={closeRef} type="button" onClick={requestClose} aria-label="Đóng" className="rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><X size={20} /></button>
              </header>
              <ProductTypePicker categories={categories} onSelect={selectCategory} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {activeCategory && productWorkflowCapability(activeCategory).workflow === 'accessory' && (
        <AccessoryProductCreateDialog
          open={open}
          rootCategoryId={activeCategory.id}
          serviceLabels={serviceLabels}
          accessoryTemplates={accessoryTemplates}
          onClose={requestClose}
          onChangeType={requestChangeType}
          onDirtyChange={setWorkflowDirty}
          onSaved={onSaved}
          onNotify={notifyWorkflow}
          onConfirmDestructive={confirmWorkflow}
          onAfterExit={finishClose}
          initialDraft={initialAccessory?.draft}
          productId={initialAccessory?.id}
          expectedUpdatedAt={initialAccessory?.updatedAt}
        />
      )}

      {activeCategory && productWorkflowCapability(activeCategory).workflow === 'car' && (
        <CarProductCreateDialog
          open={open}
          rootCategoryId={activeCategory.id}
          serviceLabels={serviceLabels}
          onClose={onClose}
          onChangeType={requestChangeType}
          onDirtyChange={setWorkflowDirty}
          onSaved={onSaved}
          onNotify={notifyWorkflow}
          onConfirmDestructive={confirmWorkflow}
          onAfterExit={finishClose}
          initialDraft={initialAccessory?.draft}
          productId={initialAccessory?.id}
          expectedUpdatedAt={initialAccessory?.updatedAt}
        />
      )}
    </>
  )
}
