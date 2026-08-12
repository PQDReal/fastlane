'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { AccessoryProductCreateDialog } from '@/components/admin/accessory-product-create-dialog'
import { ToastViewport, type ToastMessage } from '@/components/ui/toast'
import type { AdminRootCategory } from '@/lib/catalog/admin-accessory-draft'
import type { CatalogServiceLabel } from '@/lib/catalog/service-labels'
import type { AdminAccessoryTemplate } from '@/lib/catalog/admin-accessory-template-types'

function responseError(response: Response) {
  return response.json().catch(() => null).then((body: unknown) => {
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const error = (body as Record<string, unknown>).error
      if (typeof error === 'string') return error
      if (error && typeof error === 'object' && typeof (error as Record<string, unknown>).message === 'string') return String((error as Record<string, unknown>).message)
    }
    return 'Không thể tải dữ liệu cần thiết.'
  })
}

export default function NewAccessoryProductPage() {
  const router = useRouter()
  const [categories, setCategories] = useState<AdminRootCategory[]>([])
  const [serviceLabels, setServiceLabels] = useState<CatalogServiceLabel[]>([])
  const [accessoryTemplates, setAccessoryTemplates] = useState<AdminAccessoryTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const notify = useCallback((kind: ToastMessage['kind'], title: string, message?: string) => {
    const id = Date.now() + Math.random()
    setToasts((items) => [...items, { id, kind, title, message }])
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4200)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      fetch('/api/v1/admin/categories', { cache: 'no-store', signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response))
        return response.json()
      }),
      fetch('/api/v1/admin/service-labels', { cache: 'no-store', signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response))
        return response.json()
      }),
      fetch('/api/v1/admin/accessory-templates', { cache: 'no-store', signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response))
        return response.json()
      }),
    ]).then(([categoryData, labelData, templateData]) => {
      setCategories(Array.isArray(categoryData) ? categoryData : [])
      setServiceLabels(Array.isArray(labelData) ? labelData : [])
      const body = templateData && typeof templateData === 'object' && !Array.isArray(templateData) ? templateData as Record<string, unknown> : {}
      setAccessoryTemplates(Array.isArray(body.data) ? body.data as AdminAccessoryTemplate[] : [])
    }).catch((error) => {
      if (!controller.signal.aborted) notify('error', 'Không thể tải form phụ kiện', error instanceof Error ? error.message : undefined)
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [])

  const accessoryCategory = categories.find((category) => category.slug === 'phu-kien')

  return (
    <>
      <ToastViewport toasts={toasts} onClose={(id) => setToasts((items) => items.filter((item) => item.id !== id))} />
      {loading ? <div className="grid min-h-screen place-items-center text-sm text-slate-500">Đang tải form phụ kiện…</div> : accessoryCategory ? (
        <AccessoryProductCreateDialog
          open
          rootCategoryId={accessoryCategory.id}
          serviceLabels={serviceLabels}
          accessoryTemplates={accessoryTemplates}
          onClose={() => router.push('/admin/products')}
          onChangeType={() => router.push('/admin/products')}
          onDirtyChange={() => undefined}
          onSaved={() => router.push('/admin/products')}
          onNotify={notify}
          onConfirmDestructive={(title, message, onConfirm, confirmLabel = 'Tiếp tục') => {
            const id = Date.now() + Math.random()
            setToasts((items) => [...items, { id, kind: 'warning', title, message, action: { label: confirmLabel, variant: 'danger', onClick: () => { setToasts((current) => current.filter((toast) => toast.id !== id)); onConfirm() } }, secondaryAction: { label: 'Giữ lại', onClick: () => setToasts((current) => current.filter((toast) => toast.id !== id)) } }])
          }}
          onAfterExit={() => undefined}
        />
      ) : <div className="grid min-h-screen place-items-center text-sm text-red-600">Không tìm thấy danh mục phụ kiện.</div>}
    </>
  )
}
