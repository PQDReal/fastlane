import { ChevronDown, ChevronRight } from 'lucide-react'
import Link from 'next/link'

import { accessoryCatalogHref } from '@/lib/catalog/accessory-filters'
import type {
  AccessoryCatalogFacets,
  AccessoryCatalogFilters,
} from '@/lib/catalog/types'

function NavigationItems({
  filters,
  facets,
}: {
  filters: AccessoryCatalogFilters
  facets: AccessoryCatalogFacets
}) {
  return (
    <nav aria-label="Danh mục phụ kiện" className="space-y-1">
      <Link
        href={accessoryCatalogHref(filters, {
          category: null,
          vehicle: null,
          page: null,
        })}
        aria-current={!filters.category ? 'page' : undefined}
        className={`flex min-h-11 items-center justify-between rounded-lg px-3 text-sm font-semibold transition active:scale-[0.99] ${
          !filters.category
            ? 'bg-slate-950 text-white'
            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
        }`}
      >
        <span>Tất cả sản phẩm</span>
        <span className={filters.category ? 'text-slate-400' : 'text-white/70'}>
          {facets.total}
        </span>
      </Link>

      {facets.categories.map((category) => {
        const vehicles = facets.vehiclesByCategory[category.value] ?? []
        const expanded = filters.category === category.value
          || vehicles.some((vehicle) => vehicle.value === filters.vehicle)

        return (
          <div key={category.value}>
            <Link
              href={accessoryCatalogHref(filters, {
                category: category.value,
                vehicle: null,
                page: null,
              })}
              aria-current={filters.category === category.value && !filters.vehicle
                ? 'page'
                : undefined}
              className={`flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 text-sm font-semibold transition active:scale-[0.99] ${
                filters.category === category.value
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
              }`}
            >
              <span>{category.label}</span>
              <span className="flex items-center gap-2">
                <span className="text-xs tabular-nums text-slate-400">
                  {category.count}
                </span>
                {vehicles.length > 0 && (
                  expanded
                    ? <ChevronDown size={16} aria-hidden="true" />
                    : <ChevronRight size={16} aria-hidden="true" />
                )}
              </span>
            </Link>

            {expanded && vehicles.length > 0 && (
              <div className="ml-4 border-l border-slate-200 py-1 pl-2">
                {vehicles.map((vehicle) => (
                  <Link
                    key={vehicle.value}
                    href={accessoryCatalogHref(filters, {
                      category: category.value,
                      vehicle: vehicle.value,
                      page: null,
                    })}
                    aria-current={filters.vehicle === vehicle.value ? 'page' : undefined}
                    className={`flex min-h-10 items-center justify-between rounded-md px-3 text-sm transition active:scale-[0.99] ${
                      filters.vehicle === vehicle.value
                        ? 'bg-brand-600 font-bold text-white'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                    }`}
                  >
                    <span>Phụ kiện {vehicle.label}</span>
                    <span className={filters.vehicle === vehicle.value
                      ? 'text-xs tabular-nums text-white/70'
                      : 'text-xs tabular-nums text-slate-400'}>
                      {vehicle.count}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}

export function AccessoryCategoryNavigation({
  filters,
  facets,
}: {
  filters: AccessoryCatalogFilters
  facets: AccessoryCatalogFacets
}) {
  return (
    <aside aria-label="Bộ lọc danh mục">
      <details className="rounded-xl border border-slate-200 bg-white shadow-sm lg:hidden">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-4 font-bold text-slate-900 [&::-webkit-details-marker]:hidden">
          <span>{filters.vehicle ?? filters.category ?? 'Danh mục sản phẩm'}</span>
          <ChevronDown size={18} aria-hidden="true" />
        </summary>
        <div className="border-t border-slate-200 p-3">
          <NavigationItems filters={filters} facets={facets} />
        </div>
      </details>

      <div className="sticky top-[98px] hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:block">
        <h2 className="border-b border-slate-200 px-2 pb-4 text-sm font-bold uppercase tracking-[0.14em] text-slate-900">
          Danh mục sản phẩm
        </h2>
        <div className="pt-3">
          <NavigationItems filters={filters} facets={facets} />
        </div>
      </div>
    </aside>
  )
}
