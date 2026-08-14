'use client'

import React from 'react'
import Link from 'next/link'
import { ExternalLink, Zap, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

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

export function ProductCardBlock({
  title,
  items,
  onSelectProduct,
}: {
  title?: string
  items: ProductCardItem[]
  onSelectProduct?: (productName: string) => void
}) {
  if (!items || items.length === 0) return null

  return (
    <div className="my-3 space-y-2">
      {title && (
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          {title}
        </p>
      )}
      <div className="flex gap-2.5 overflow-x-auto pb-2 pt-1 scrollbar-thin scrollbar-thumb-slate-200" data-scrollable>
        {items.map((item) => {
          const formattedPrice = item.price
            ? `${(item.price >= 1_000_000_000 ? (item.price / 1_000_000_000).toFixed(2).replace(/\.00$/, '') + ' tỷ' : (item.price / 1_000_000).toFixed(1).replace(/\.0$/, '') + ' triệu')} VNĐ`
            : 'Liên hệ'

          return (
            <div
              key={item.id}
              className="flex w-[200px] shrink-0 flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-brand-300 hover:shadow-md"
            >
              {/* Product Thumbnail / Image Placeholder */}
              <div className="relative flex h-28 w-full items-center justify-center bg-slate-50 p-2 overflow-hidden border-b border-slate-100">
                {item.thumbnailUrl ? (
                  <img
                    src={item.thumbnailUrl}
                    alt={item.name}
                    className="h-full w-full object-contain object-center transition duration-300 hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-300">
                    <Zap size={28} className="text-brand-400 mb-1" />
                    <span className="text-[10px] text-slate-400 font-medium">{item.productType === 'CAR' ? 'Ô tô điện' : item.productType === 'BIKE' ? 'Xe máy điện' : 'Phụ kiện'}</span>
                  </div>
                )}
                <span className="absolute top-1.5 right-1.5 rounded-md bg-slate-900/70 px-1.5 py-0.5 text-[9px] font-medium text-white backdrop-blur-[2px]">
                  {item.productType === 'CAR' ? 'Ô tô' : item.productType === 'BIKE' ? 'Xe máy' : 'Phụ kiện'}
                </span>
              </div>

              {/* Product Details */}
              <div className="flex flex-1 flex-col p-2.5">
                <h4 className="line-clamp-1 text-xs font-bold text-slate-900" title={item.name}>
                  {item.name}
                </h4>
                <p className="mt-1 text-[13px] font-extrabold text-brand-600">
                  {formattedPrice}
                </p>
                {item.summary && (
                  <p className="mt-1 line-clamp-2 text-[11px] text-slate-500 leading-tight">
                    {item.summary}
                  </p>
                )}

                {/* CTAs */}
                <div className="mt-3 flex items-center gap-1.5 pt-1 border-t border-slate-100">
                  <Link
                    href={item.url}
                    className="flex-1 rounded-lg bg-slate-900 px-2 py-1.5 text-center text-[11px] font-medium text-white transition hover:bg-slate-800 active:scale-95 flex items-center justify-center gap-1"
                  >
                    <span>Tới trang</span>
                    <ArrowRight size={11} />
                  </Link>
                  {onSelectProduct && (
                    <button
                      type="button"
                      onClick={() => onSelectProduct(item.name)}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-100 active:scale-95"
                      title="Hỏi thêm về xe này"
                    >
                      Tư vấn
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
