'use client'

import React from 'react'
import Link from 'next/link'
import { ArrowRight, Zap } from 'lucide-react'

export type ComparisonProduct = {
  productId: string
  name: string
  thumbnailUrl?: string | null
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
    <div className="my-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/80 px-3 py-2">
        <p className="text-xs font-semibold text-slate-700">So sánh thông số chi tiết</p>
      </div>
      <div className="overflow-x-auto p-2 scrollbar-thin scrollbar-thumb-slate-200" data-scrollable>
        <div className="grid grid-flow-col auto-cols-[140px] gap-2">
          {products.map((product) => (
            <div
              key={product.productId}
              className="flex flex-col rounded-lg border border-slate-200/80 bg-white p-2.5 shadow-xs"
            >
              {/* Vehicle Thumbnail */}
              <div className="relative mb-2 flex h-20 w-full items-center justify-center rounded-md bg-slate-50 p-1 border border-slate-100">
                {product.thumbnailUrl ? (
                  <img
                    src={product.thumbnailUrl}
                    alt={product.name}
                    className="h-full w-full object-contain object-center"
                    loading="lazy"
                  />
                ) : (
                  <Zap size={22} className="text-brand-500" />
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
                    <span className="font-semibold text-slate-800 break-words">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
