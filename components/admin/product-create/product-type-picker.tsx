import { Bike, Boxes, CarFront, CircleAlert, PackagePlus } from 'lucide-react'

import type { AdminRootCategory } from '@/lib/catalog/admin-accessory-draft'
import { productWorkflowCapability } from './workflow-contract'

const iconBySlug = {
  'phu-kien': PackagePlus,
  'o-to-dien': CarFront,
  'xe-may-dien': Bike,
} as const

export function ProductTypePicker({
  categories,
  onSelect,
}: {
  categories: AdminRootCategory[]
  onSelect: (category: AdminRootCategory) => void
}) {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white">
      <div className="mx-auto w-full max-w-5xl p-5 sm:p-8 lg:p-10">
        <div className="max-w-2xl">
          <h3 className="text-xl font-bold text-slate-950">Chọn loại sản phẩm</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">Loại sản phẩm quyết định các trường thông tin, biến thể và cách xem trước ở những bước tiếp theo.</p>
        </div>

        {categories.length > 0 ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {categories.map((category) => {
              const capability = productWorkflowCapability(category)
              const Icon = iconBySlug[category.slug as keyof typeof iconBySlug] ?? Boxes
              const supported = capability.status === 'supported'
              const statusLabel = capability.status === 'planned' ? 'Sắp hỗ trợ' : capability.status === 'unavailable' ? 'Chưa hỗ trợ' : 'Có thể tạo'

              return (
                <button
                  key={category.id}
                  type="button"
                  disabled={!supported}
                  onClick={() => onSelect(category)}
                  className="group flex min-h-32 items-start gap-4 rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-slate-400 hover:shadow-sm active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70 disabled:hover:border-slate-200 disabled:hover:shadow-none"
                  aria-label={`${category.name} — ${statusLabel}`}
                >
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ${supported ? 'bg-slate-950 text-white' : 'bg-slate-200 text-slate-500'}`}><Icon size={20} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-slate-950">{category.name}</span>
                    <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${supported ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{statusLabel}</span>
                    <span className="mt-2 block text-xs leading-5 text-slate-500">{supported ? 'Mở quy trình nhập thông tin dành cho phụ kiện.' : 'Quy trình tạo mới cho loại này đang được xây dựng.'}</span>
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="mt-6 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <div><p className="font-bold">Chưa tải được loại sản phẩm</p><p className="mt-1">Đóng cửa sổ và thử lại sau khi danh mục được tải xong.</p></div>
          </div>
        )}
      </div>
    </main>
  )
}
