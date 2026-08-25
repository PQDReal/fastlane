'use client'

import React from 'react'
import Link from 'next/link'
import { Zap, ArrowRight } from 'lucide-react'

export type ProductCardItem = {
  id: string
  name: string
  slug: string
  productType: string
  thumbnailUrl?: string | null
  price?: number | null
  summary?: string | null
  url: string
}

function ProductCardBlockImpl({
  title,
  items,
}: {
  title?: string
  items: ProductCardItem[]
}) {
  if (!items || items.length === 0) return null

  return (
    <div className="my-2.5 space-y-1.5">
      {title && (
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          {title}
        </p>
      )}
      <div className="flex gap-2 horizontal-scroll-smooth pb-1.5 pt-0.5" data-scrollable>
        {items.map((item) => {
          const formattedPrice = item.price
            ? `${(item.price >= 1_000_000_000 ? (item.price / 1_000_000_000).toFixed(2).replace(/\.00$/, '') + ' tỷ' : (item.price / 1_000_000).toFixed(1).replace(/\.0$/, '') + ' triệu')} VNĐ`
            : 'Liên hệ'

          return (
            <div
              key={item.id}
              className="flex w-[160px] shrink-0 flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-xs transition hover:border-brand-300"
            >
              <div>
                {/* Product Thumbnail */}
                <div className="relative flex h-20 w-full items-center justify-center rounded-lg bg-slate-50 p-1 overflow-hidden border border-slate-100/80">
                  {item.thumbnailUrl ? (
                    <img
                      src={item.thumbnailUrl}
                      alt={item.name}
                      className="h-full w-full object-contain object-center transition duration-300 hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-300">
                      <Zap size={22} className="text-brand-400 mb-0.5" />
                      <span className="text-[9px] text-slate-400 font-medium">
                        {item.productType === 'CAR' ? 'Ô tô' : item.productType === 'BIKE' ? 'Xe máy' : 'Phụ kiện'}
                      </span>
                    </div>
                  )}
                  <span className="absolute top-1 right-1 rounded-md bg-slate-900/70 px-1.5 py-0.5 text-[8px] font-medium text-white backdrop-blur-[2px]">
                    {item.productType === 'CAR' ? 'Ô tô' : item.productType === 'BIKE' ? 'Xe máy' : 'Phụ kiện'}
                  </span>
                </div>

                {/* Product Details */}
                <div className="mt-1.5 flex flex-col">
                  <h4 className="line-clamp-1 text-xs font-bold text-slate-900" title={item.name}>
                    {item.name}
                  </h4>
                  <p className="mt-0.5 text-xs font-bold text-brand-600">
                    {formattedPrice}
                  </p>
                </div>
              </div>

              {/* Navigation CTA */}
              <div className="mt-2.5 pt-1.5 border-t border-slate-100">
                <Link
                  href={item.url}
                  className="flex w-full items-center justify-center gap-1 rounded-lg bg-slate-900 py-1.5 text-center text-[11px] font-medium text-white transition hover:bg-slate-800 active:scale-95"
                >
                  <span>Xem chi tiết</span>
                  <ArrowRight size={11} />
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const ProductCardBlock = React.memo(ProductCardBlockImpl)

