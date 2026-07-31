'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { startNavigationLoading } from '@/components/navigation-loading-indicator'
import { accessoryCatalogHref } from '@/lib/catalog/accessory-filters'
import type {
  AccessoryCatalogFilters,
  AccessoryCatalogSort,
} from '@/lib/catalog/types'

export function AccessorySortSelect({
  filters,
}: {
  filters: AccessoryCatalogFilters
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <label>
      <span className="sr-only">Sắp xếp</span>
      <select
        value={filters.sort}
        disabled={pending}
        aria-busy={pending}
        onChange={(event) => {
          const sort = event.target.value as AccessoryCatalogSort
          startNavigationLoading()
          startTransition(() => {
            router.push(accessoryCatalogHref(filters, { sort, page: null }), {
              scroll: false,
            })
          })
        }}
        className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-wait disabled:text-slate-400"
      >
        <option value="name-asc">Tên A–Z</option>
        <option value="price-asc">Giá thấp đến cao</option>
        <option value="price-desc">Giá cao đến thấp</option>
      </select>
    </label>
  )
}
