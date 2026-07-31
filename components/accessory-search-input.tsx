'use client'

import { Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'

import { startNavigationLoading } from '@/components/navigation-loading-indicator'
import { accessoryCatalogHref } from '@/lib/catalog/accessory-filters'
import type { AccessoryCatalogFilters } from '@/lib/catalog/types'

const SEARCH_DEBOUNCE_MS = 350

export function AccessorySearchInput({
  filters,
}: {
  filters: AccessoryCatalogFilters
}) {
  const router = useRouter()
  const [query, setQuery] = useState(filters.query)
  const [pending, startTransition] = useTransition()
  const lastNavigatedQuery = useRef(filters.query)

  useEffect(() => {
    if (filters.query === lastNavigatedQuery.current) return
    lastNavigatedQuery.current = filters.query
    setQuery(filters.query)
  }, [filters.query])

  useEffect(() => {
    const nextQuery = query.trim()
    if (nextQuery === filters.query) return

    const timeout = window.setTimeout(() => {
      lastNavigatedQuery.current = nextQuery
      startNavigationLoading()
      startTransition(() => {
        router.replace(accessoryCatalogHref(filters, {
          q: nextQuery || null,
          page: null,
        }), { scroll: false })
      })
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timeout)
  }, [filters, query, router])

  return (
    <label className="relative block">
      <span className="sr-only">Tìm theo tên phụ kiện</span>
      <Search
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
        size={18}
        aria-hidden="true"
      />
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Tìm theo tên phụ kiện..."
        aria-busy={pending}
        className="h-12 w-full rounded-lg border border-slate-200 pl-11 pr-4 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
    </label>
  )
}
