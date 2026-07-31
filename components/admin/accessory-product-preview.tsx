'use client'

import { useMemo, useState } from 'react'
import { Eye, LayoutGrid, PanelsTopLeft } from 'lucide-react'

import { AccessoryCard } from '@/components/accessory-card'
import { AccessoryDetailClient } from '@/components/accessory-detail-client'
import {
  adminAccessoryDraftToCatalogProduct,
  type AdminAccessoryDraft,
  type DraftCollection,
} from '@/lib/catalog/admin-accessory-draft'
import type { CatalogServiceLabel } from '@/lib/catalog/service-labels'

type PreviewSurface = 'card' | 'detail'

export function AccessoryProductPreview({
  draft,
  serviceLabels,
  collections,
}: {
  draft: AdminAccessoryDraft
  serviceLabels: CatalogServiceLabel[]
  collections: DraftCollection[]
}) {
  const [surface, setSurface] = useState<PreviewSurface>('card')
  const product = useMemo(
    () => adminAccessoryDraftToCatalogProduct(draft, serviceLabels, collections),
    [collections, draft, serviceLabels],
  )

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
      <header className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Eye size={17} className="text-brand-600" /> Xem trước giao diện khách hàng
        </div>
        <span className="w-fit rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
          Dữ liệu chưa lưu · Đã khóa mua hàng
        </span>
      </header>

      <div className="border-b border-slate-200 bg-white px-4 pt-3 sm:px-5">
        <div role="tablist" aria-label="Chọn bề mặt xem trước" className="flex gap-1">
          <button
            type="button"
            role="tab"
            id="preview-card-tab"
            aria-controls="preview-card-panel"
            aria-selected={surface === 'card'}
            onClick={() => setSurface('card')}
            className={`inline-flex min-h-10 items-center gap-2 border-b-2 px-3 text-sm font-bold transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${surface === 'card' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
          >
            <LayoutGrid size={16} /> Card danh sách
          </button>
          <button
            type="button"
            role="tab"
            id="preview-detail-tab"
            aria-controls="preview-detail-panel"
            aria-selected={surface === 'detail'}
            onClick={() => setSurface('detail')}
            className={`inline-flex min-h-10 items-center gap-2 border-b-2 px-3 text-sm font-bold transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${surface === 'detail' ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
          >
            <PanelsTopLeft size={16} /> Trang chi tiết
          </button>
        </div>
      </div>

      {surface === 'card' ? (
        <div id="preview-card-panel" role="tabpanel" aria-labelledby="preview-card-tab" className="p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1480px]">
            <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.17em] text-brand-700">Kết quả danh sách</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">1 phụ kiện phù hợp</h2>
              </div>
              <p className="text-sm text-slate-500">Card thật · có thể chọn swatch và vuốt ảnh</p>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <AccessoryCard product={product} previewMode />
            </div>
          </div>
        </div>
      ) : (
        <div id="preview-detail-panel" role="tabpanel" aria-labelledby="preview-detail-tab" className="bg-slate-50">
          <AccessoryDetailClient product={product} previewMode />
        </div>
      )}
    </section>
  )
}
