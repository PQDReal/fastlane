'use client'

import React from 'react'
import Link from 'next/link'
import { ArrowRight, Zap } from 'lucide-react'

export type ComparisonProduct = {
  productId: string
  name: string
  thumbnailUrl?: string | null
  url?: string
  values: Record<string, string>
}

export function ComparisonCardBlock({
  criteria,
  products,
  onSelectProduct,
}: {
  criteria: string[]
  products: ComparisonProduct[]
  onSelectProduct?: (productName: string) => void
}) {
  if (!products || products.length < 2) return null

  return (
    <div className="my-2.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
      <div className="overflow-x-auto p-2 scrollbar-thin scrollbar-thumb-slate-200" data-scrollable>
        <div className="grid grid-flow-col auto-cols-[155px] gap-2">
          {products.map((product) => (
            <div
              key={product.productId}
              className="flex flex-col justify-between rounded-lg border border-slate-200/80 bg-white p-2.5 shadow-2xs hover:border-brand-300 transition"
            >
              <div>
                {/* Vehicle Thumbnail */}
                <div className="relative mb-2 flex h-24 w-full items-center justify-center rounded-md bg-slate-50 p-1.5 border border-slate-100 overflow-hidden">
                  {product.thumbnailUrl ? (
                    <img
                      src={product.thumbnailUrl}
                      alt={product.name}
                      className="h-full w-full object-contain object-center transition duration-300 hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <Zap size={24} className="text-brand-500" />
                  )}
                </div>

                <h5 className="line-clamp-1 text-xs font-bold text-slate-900" title={product.name}>
                  {product.name}
                </h5>

                {/* Specs Rows */}
                <div className="mt-2 space-y-1.5 text-[11px] border-t border-slate-100 pt-2">
                  {Object.entries(product.values).map(([key, val]) => (
                    <div key={key} className="flex flex-col">
                      <span className="text-[10px] text-slate-400 font-medium">{key}</span>
                      <span className="font-bold text-brand-600 break-words">{val}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Navigation CTAs */}
              <div className="mt-3 flex items-center gap-1.5 pt-2 border-t border-slate-100">
                {product.url ? (
                  <Link
                    href={product.url}
                    className="flex-1 rounded-lg bg-slate-900 px-2 py-1.5 text-center text-[11px] font-medium text-white transition hover:bg-slate-800 active:scale-95 flex items-center justify-center gap-1"
                  >
                    <span>Tới trang</span>
                    <ArrowRight size={11} />
                  </Link>
                ) : (
                  <div className="flex-1" />
                )}
                {onSelectProduct && (
                  <button
                    type="button"
                    onClick={() => onSelectProduct(product.name)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-100 active:scale-95"
                    title="Hỏi thêm về xe này"
                  >
                    Tư vấn
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
