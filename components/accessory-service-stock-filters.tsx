'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'

import { accessoryCatalogHref } from '@/lib/catalog/accessory-filters'
import type {
  AccessoryCatalogFacets,
  AccessoryCatalogFilters,
  AccessoryStockFilter,
} from '@/lib/catalog/types'

export function AccessoryServiceStockFilters({
  filters,
  facets,
}: {
  filters: AccessoryCatalogFilters
  facets: AccessoryCatalogFacets
}) {
  const router = useRouter()
  const [services, setServices] = useState(filters.services)
  const [stock, setStock] = useState(filters.stock)
  const [pending, startTransition] = useTransition()
  const serviceKey = filters.services.join('\u0000')

  useEffect(() => {
    setServices(filters.services)
  }, [serviceKey, filters.services])

  useEffect(() => {
    setStock(filters.stock)
  }, [filters.stock])

  const navigate = (nextFilters: AccessoryCatalogFilters) => {
    startTransition(() => {
      router.push(accessoryCatalogHref(nextFilters, { page: null }), {
        scroll: false,
      })
    })
  }

  return (
    <div
      aria-busy={pending}
      className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-[minmax(0,1fr)_240px]"
    >
      {facets.services.length > 0 && (
        <fieldset>
          <legend className="text-xs font-bold text-slate-600">Dịch vụ</legend>
          <div className="mt-2 flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
            {facets.services.map((service) => (
              <label
                key={service.value}
                className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700"
              >
                <input
                  type="checkbox"
                  value={service.value}
                  disabled={pending}
                  checked={services.includes(service.value)}
                  onChange={(event) => {
                    const nextServices = event.target.checked
                      ? [...services, service.value]
                      : services.filter((value) => value !== service.value)
                    setServices(nextServices)
                    navigate({ ...filters, services: nextServices })
                  }}
                  className="h-4 w-4 rounded border-slate-300 accent-brand-600 disabled:cursor-wait"
                />
                <span>
                  {service.label}{' '}
                  <span className="text-slate-400">({service.count})</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <label className="text-xs font-bold text-slate-600">
        Tình trạng kho
        <select
          value={stock}
          disabled={pending}
          onChange={(event) => {
            const nextStock = event.target.value as AccessoryStockFilter
            setStock(nextStock)
            navigate({ ...filters, stock: nextStock })
          }}
          className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-wait disabled:text-slate-400"
        >
          <option value="all">Tất cả tình trạng</option>
          <option value="in-stock">Đang có hàng</option>
        </select>
      </label>
    </div>
  )
}
