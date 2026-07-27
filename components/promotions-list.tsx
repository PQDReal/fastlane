'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { PromoCard } from '@/components/promo-card'
import type { PromotionProductType } from '@/lib/promotions/product-types'

type ProductFilter = 'ALL' | PromotionProductType

export type PromotionListItem = {
  id: string
  title: string
  desc: string
  productTypes: PromotionProductType[]
  productLabel: string
  expires: string
  image: string
  code: string
  discount: string
}

const filters: Array<{ value: ProductFilter; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'CAR', label: 'Ô tô' },
  { value: 'BIKE', label: 'Xe máy' },
  { value: 'ACCESSORY', label: 'Phụ kiện' },
]
const PAGE_SIZE = 5

export function PromotionsList({ promotions }: { promotions: PromotionListItem[] }) {
  const [selected, setSelected] = useState<ProductFilter>('ALL')
  const [page, setPage] = useState(1)
  const filtered = useMemo(
    () => selected === 'ALL' ? promotions : promotions.filter((item) => item.productTypes.includes(selected)),
    [promotions, selected],
  )
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const shown = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  useEffect(() => setPage(1), [selected])

  return (
    <>
      <div className="mb-10 flex flex-wrap justify-center gap-3" role="group" aria-label="Lọc khuyến mãi theo loại sản phẩm">
        {filters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setSelected(filter.value)}
            aria-pressed={selected === filter.value}
            className={`rounded-full border px-6 py-3 text-sm font-bold transition-all ${
              selected === filter.value
                ? 'border-slate-950 bg-slate-950 text-white shadow-lg'
                : 'border-slate-200 bg-white text-slate-600 hover:border-brand-500 hover:text-brand-600'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {shown.length > 0 ? (
        <>
          <div className="flex flex-col gap-10">
            {shown.map((item) => (
              <PromoCard
                key={item.id}
                title={item.title}
                desc={item.desc}
                type={item.productLabel}
                expires={item.expires}
                image={item.image}
                code={item.code}
                discount={item.discount}
              />
            ))}
          </div>
          {pageCount > 1 && (
            <nav className="mt-12 flex flex-wrap items-center justify-center gap-2" aria-label="Phân trang khuyến mãi">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={currentPage === 1}
                aria-label="Trang trước"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition-colors hover:border-brand-500 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={18} />
              </button>
              {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
                <button
                  key={number}
                  type="button"
                  onClick={() => setPage(number)}
                  aria-label={`Trang ${number}`}
                  aria-current={currentPage === number ? 'page' : undefined}
                  className={`h-10 min-w-10 rounded-full px-3 text-sm font-bold transition-colors ${
                    currentPage === number
                      ? 'bg-slate-950 text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:border-brand-500 hover:text-brand-600'
                  }`}
                >
                  {number}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                disabled={currentPage === pageCount}
                aria-label="Trang sau"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition-colors hover:border-brand-500 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight size={18} />
              </button>
            </nav>
          )}
        </>
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-14 text-center shadow-sm">
          <p className="font-semibold text-slate-700">Không có ưu đãi phù hợp với bộ lọc này.</p>
        </div>
      )}
    </>
  )
}