'use client'

import { ChevronRight, ShieldCheck } from 'lucide-react'

interface AfterSalesHeroProps {
  onSelectTab: (tab: string) => void
}

export function AfterSalesHero({ onSelectTab }: AfterSalesHeroProps) {
  return (
    <section className="border-b border-slate-200 bg-[#f8fafc] pt-10 pb-8 sm:pt-14 sm:pb-10 lg:pt-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#836100]">Dịch vụ hậu mãi chính hãng</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
            Đồng hành cùng bạn trên mọi hành trình
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
            Tra cứu chính sách bảo hành, lịch trình bảo dưỡng, dịch vụ sửa chữa và các hỗ trợ sau bán hàng dành cho ô tô
            điện và xe máy điện.
          </p>
        </div>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => onSelectTab('warranty')}
            className="inline-flex items-center justify-center gap-2 border border-slate-300 bg-white px-6 py-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-700 transition hover:border-[#836100] hover:text-[#836100] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#836100] focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            <ShieldCheck size={15} />
            Xem chính sách bảo hành
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </section>
  )
}
