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
}: {
  criteria: string[]
  products: ComparisonProduct[]
}) {
  if (!products || products.length < 2) return null

  return (
    <div className="my-2 horizontal-scroll-smooth pb-1" data-scrollable>
      <div className="grid grid-flow-col auto-cols-[148px] gap-2">
        {products.map((product) => (
          <div
            key={product.productId}
            className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-2 shadow-xs transition hover:border-brand-300"
          >
            <div>
              {/* Vehicle Thumbnail */}
              <div className="relative mb-1.5 flex h-20 w-full items-center justify-center rounded-lg bg-slate-50 p-1 border border-slate-100/80 overflow-hidden">
                {product.thumbnailUrl ? (
                  <img
                    src={product.thumbnailUrl}
                    alt={product.name}
                    className="h-full w-full object-contain object-center transition duration-300 hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <Zap size={20} className="text-brand-500" />
                )}
              </div>

              <h5 className="line-clamp-1 text-xs font-bold text-slate-900" title={product.name}>
                {product.name}
              </h5>

              {/* Specs Rows */}
              <div className="mt-1.5 space-y-1 border-t border-slate-100 pt-1.5">
                {Object.entries(product.values).map(([key, val]) => (
                  <div key={key} className="flex flex-col">
                    <span className="text-[10px] text-slate-400 font-medium">{key}</span>
                    <span className="text-[11px] font-bold text-brand-600 break-words">{val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Navigation CTA */}
            {product.url && (
              <div className="mt-2.5 pt-1.5 border-t border-slate-100">
                <Link
                  href={product.url}
                  className="flex w-full items-center justify-center gap-1 rounded-lg bg-slate-900 py-1.5 text-center text-[11px] font-medium text-white transition hover:bg-slate-800 active:scale-95"
                >
                  <span>Xem chi tiết</span>
                  <ArrowRight size={11} />
                </Link>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
