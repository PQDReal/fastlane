'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { AccessoryProductCreateDialog } from '@/components/admin/accessory-product-create-dialog'
import { ToastViewport, type ToastMessage } from '@/components/ui/toast'
import type { AdminRootCategory } from '@/lib/catalog/admin-accessory-draft'
import type { CatalogServiceLabel } from '@/lib/catalog/service-labels'
import type { AdminAccessoryTemplate } from '@/lib/catalog/admin-accessory-template-types'
import type { AdminAccessoryEditorData } from '@/lib/catalog/admin-accessory-write'

async function responseError(response: Response) {
  const body: unknown = await response.json().catch(() => null)
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const error = (body as Record<string, unknown>).error
    if (typeof error === 'string') return error
    if (error && typeof error === 'object' && typeof (error as Record<string, unknown>).message === 'string') return String((error as Record<string, unknown>).message)
  }
  return 'Không thể tải dữ liệu phụ kiện.'
}

export default function EditAccessoryProductPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = use(params)
  const router = useRouter()
  const [data, setData] = useState<AdminAccessoryEditorData | null>(null)
  const [categories, setCategories] = useState<AdminRootCategory[]>([])
  const [serviceLabels, setServiceLabels] = useState<CatalogServiceLabel[]>([])
  const [accessoryTemplates, setAccessoryTemplates] = useState<AdminAccessoryTemplate[]>([])
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const notify = useCallback((kind: ToastMessage['kind'], title: string, message?: string) => {
    const id = Date.now() + Math.random()
    setToasts((items) => [...items, { id, kind, title, message }])
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4200)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      fetch(`/api/v1/admin/products/${encodeURIComponent(productId)}`, { cache: 'no-store', signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response))
        const body = await response.json() as { data?: unknown }
        return body.data as AdminAccessoryEditorData
      }),
      fetch('/api/v1/admin/categories', { cache: 'no-store', signal: controller.signal }).then(async (response) => { if (!response.ok) throw new Error(await responseError(response)); return response.json() }),
      fetch('/api/v1/admin/service-labels', { cache: 'no-store', signal: controller.signal }).then(async (response) => { if (!response.ok) throw new Error(await responseError(response)); return response.json() }),
      fetch('/api/v1/admin/accessory-templates', { cache: 'no-store', signal: controller.signal }).then(async (response) => { if (!response.ok) throw new Error(await responseError(response)); return response.json() }),
    ]).then(([product, categoryData, labelData, templateData]) => {
      setData(product)
      setCategories(Array.isArray(categoryData) ? categoryData : [])
      setServiceLabels(Array.isArray(labelData) ? labelData : [])
      const body = templateData && typeof templateData === 'object' && !Array.isArray(templateData) ? templateData as Record<string, unknown> : {}
      setAccessoryTemplates(Array.isArray(body.data) ? body.data as AdminAccessoryTemplate[] : [])
    }).catch((error) => {
      if (!controller.signal.aborted) notify('error', 'Không thể tải phụ kiện', error instanceof Error ? error.message : undefined)
    })
    return () => controller.abort()
  }, [notify, productId])

  const category = data ? categories.find((item) => item.id === data.draft.rootCategoryId) ?? { id: data.draft.rootCategoryId, name: 'Phụ kiện', slug: 'phu-kien', isActive: true } : null

  return <>
    <ToastViewport toasts={toasts} onClose={(id) => setToasts((items) => items.filter((item) => item.id !== id))} />
    {data && category ? <AccessoryProductCreateDialog
      open
      rootCategoryId={category.id}
      serviceLabels={serviceLabels}
      accessoryTemplates={accessoryTemplates}
      initialDraft={data.draft}
      productId={data.id}
      expectedUpdatedAt={data.updatedAt}
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
    /> : <div className="grid min-h-screen place-items-center text-sm text-slate-500">Đang tải phụ kiện…</div>}
  </>
}
