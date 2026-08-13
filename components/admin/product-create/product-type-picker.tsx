import { Bike, Boxes, CarFront, CircleAlert, PackagePlus } from 'lucide-react'

import type { AdminRootCategory } from '@/lib/catalog/admin-accessory-draft'
import { productWorkflowCapability } from './workflow-contract'

const iconBySlug = {
  'phu-kien': PackagePlus,
  'o-to-dien': CarFront,
  'xe-may-dien': Bike,
} as const

const iconMotionBySlug = {
  'o-to-dien': 'product-type-icon--car',
  'xe-may-dien': 'product-type-icon--motorbike',
  'phu-kien': 'product-type-icon--accessory',
} as const

export function ProductTypePicker({
  categories,
  onSelect,
}: {
  categories: AdminRootCategory[]
  onSelect: (category: AdminRootCategory) => void
}) {
  return (
    <main className="flex min-h-0 flex-1 items-center overflow-y-auto overscroll-contain bg-white">
      <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14 lg:px-10">
        <div className="mx-auto max-w-3xl text-center">
          <h3 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Chọn loại sản phẩm</h3>
          <p className="mt-4 text-base leading-7 text-slate-500 sm:text-lg">Loại sản phẩm quyết định các trường thông tin, biến thể và cách xem trước ở những bước tiếp theo.</p>
        </div>

        {categories.length > 0 ? (
          <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {categories.map((category) => {
              const capability = productWorkflowCapability(category)
              const Icon = iconBySlug[category.slug as keyof typeof iconBySlug] ?? Boxes
              const iconMotion = iconMotionBySlug[category.slug as keyof typeof iconMotionBySlug] ?? 'product-type-icon--accessory'
              const supported = capability.status === 'supported'
              const statusLabel = capability.status === 'planned' ? 'Sắp hỗ trợ' : capability.status === 'unavailable' ? 'Chưa hỗ trợ' : 'Có thể tạo'

              return (
                <button
                  key={category.id}
                  type="button"
                  disabled={!supported}
                  onClick={() => onSelect(category)}
                  className="group flex min-h-48 flex-col items-center justify-center gap-5 rounded-xl border border-slate-200 bg-white p-6 text-center transition hover:border-[#b88a08] hover:shadow-md active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70 disabled:hover:border-slate-200 disabled:hover:shadow-none"
                  aria-label={`${category.name} — ${statusLabel}`}
                >
                  <span className={`product-type-icon ${iconMotion} grid h-16 w-16 shrink-0 place-items-center rounded-xl ${supported ? 'bg-slate-950 text-white' : 'bg-slate-200 text-slate-500'}`}><Icon size={29} /></span>
                  <span className="min-w-0">
                    <span className="block text-xl font-bold text-slate-950 sm:text-2xl">{category.name}</span>
                    {/* <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${supported ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{statusLabel}</span> */}
                    {/* <span className="mt-2 block text-xs leading-5 text-slate-500">{supported ? 'Mở quy trình nhập thông tin dành cho phụ kiện.' : 'Quy trình tạo mới cho loại này đang được xây dựng.'}</span> */}
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
