import {
  ArrowRight,
  ChevronRight,
  PackageSearch,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import Link from 'next/link'

import { AccessoryCategoryNavigation } from '@/components/accessory-category-navigation'
import { AccessoryCard } from '@/components/accessory-card'
import { AccessorySortSelect } from '@/components/accessory-sort-select'
import { Footer } from '@/components/footer'
import { Header } from '@/components/header'
import { Pagination } from '@/components/pagination'
import {
  accessorySearchParams,
  parseAccessoryFilters,
  parseAccessoryPage,
  type AccessorySearchParams,
} from '@/lib/catalog/accessory-filters'
import { listAccessoryCatalog } from '@/lib/catalog/server'
import type {
  AccessoryCatalogFacets,
  AccessoryCatalogFilters,
} from '@/lib/catalog/types'

export const dynamic = 'force-dynamic'

function AdvancedFilterFields({
  filters,
  facets,
}: {
  filters: AccessoryCatalogFilters
  facets: AccessoryCatalogFacets
}) {
  return (
    <div className="grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2 xl:grid-cols-4">
      {facets.services.length > 0 && (
        <fieldset>
          <legend className="text-xs font-bold text-slate-600">Dịch vụ</legend>
          <div className="mt-2 flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
            {facets.services.map((service) => (
              <label key={service.value} className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  name="service"
                  value={service.value}
                  defaultChecked={filters.services.includes(service.value)}
                  className="h-4 w-4 rounded border-slate-300 accent-brand-600"
                />
                <span>{service.label} <span className="text-slate-400">({service.count})</span></span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <label className="text-xs font-bold text-slate-600">
        Tình trạng kho
        <select
          name="stock"
          defaultValue={filters.stock}
          className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        >
          <option value="all">Tất cả tình trạng</option>
          <option value="in-stock">Đang có hàng</option>
        </select>
      </label>
      <label className="text-xs font-bold text-slate-600">
        Giá từ
        <input
          type="number"
          name="minPrice"
          min="0"
          step="1000"
          defaultValue={filters.minimumPrice ?? ''}
          placeholder={facets.minimumPrice === null ? '0' : String(facets.minimumPrice)}
          className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </label>
      <label className="text-xs font-bold text-slate-600">
        Giá đến
        <input
          type="number"
          name="maxPrice"
          min="0"
          step="1000"
          defaultValue={filters.maximumPrice ?? ''}
          placeholder={facets.maximumPrice === null ? '0' : String(facets.maximumPrice)}
          className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </label>
    </div>
  )
}

export default async function AccessoriesPage({
  searchParams,
}: {
  searchParams?: Promise<AccessorySearchParams>
}) {
  const resolvedSearchParams = await searchParams
  let filters = parseAccessoryFilters(resolvedSearchParams)
  const catalogPage = await listAccessoryCatalog({
    page: parseAccessoryPage(resolvedSearchParams),
    pageSize: 12,
    filters,
  })
  if (filters.category
    && !catalogPage.facets.vehicleRelevantCategories.includes(filters.category)) {
    filters = { ...filters, vehicle: null }
  }
  const firstResult = catalogPage.total === 0
    ? 0
    : (catalogPage.page - 1) * catalogPage.pageSize + 1
  const lastResult = Math.min(
    catalogPage.total,
    catalogPage.page * catalogPage.pageSize,
  )
  const advancedFilterCount = filters.services.length
    + Number(filters.stock !== 'all')
    + Number(filters.minimumPrice !== null)
    + Number(filters.maximumPrice !== null)

  return (
    <main className="flex min-h-screen flex-col bg-[#f6f7f9] pt-[74px]">
      <Header />

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1440px] px-6 py-9 lg:px-12 lg:py-11">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            <Link href="/" className="transition hover:text-brand-700">Trang chủ</Link>
            <ChevronRight size={14} />
            <span className="text-slate-700">Phụ kiện</span>
          </nav>

          <div className="mt-6 max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">Phụ kiện chính hãng</p>
            <h1 className="mt-2 text-4xl font-bold tracking-[-0.03em] text-slate-950 sm:text-5xl">
              Phụ kiện VinFast
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-500 sm:text-base">
              Tìm theo tên sản phẩm hoặc thu hẹp kết quả theo danh mục và dòng xe phù hợp.
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-8 lg:px-12 lg:py-10">
        <div className="grid gap-6 lg:grid-cols-[270px_minmax(0,1fr)] lg:gap-8">
          <AccessoryCategoryNavigation
            filters={filters}
            facets={catalogPage.facets}
          />

          <section aria-labelledby="results-heading" className="min-w-0">
          <form action="/accessories" method="get" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            {filters.category && (
              <input type="hidden" name="category" value={filters.category} />
            )}
            {filters.vehicle && (
              <input type="hidden" name="vehicle" value={filters.vehicle} />
            )}
            <input type="hidden" name="sort" value={filters.sort} />

            <div className="grid gap-3 sm:grid-cols-[minmax(240px,1fr)_220px_auto]">
              <label className="relative block">
                <span className="sr-only">Tìm phụ kiện</span>
                <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  type="search"
                  name="q"
                  defaultValue={filters.query}
                  placeholder="Tìm theo tên hoặc SKU..."
                  className="h-12 w-full rounded-lg border border-slate-200 pl-11 pr-4 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </label>

              <AccessorySortSelect filters={filters} />

              <button type="submit" className="h-12 rounded-lg bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-brand-700">
                Tìm kiếm
              </button>
            </div>

            <details open={advancedFilterCount > 0 || undefined} className="mt-3">
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between rounded-lg px-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2">
                  <SlidersHorizontal size={16} /> Bộ lọc nâng cao
                </span>
                <span className="text-xs font-medium text-slate-400">
                  {advancedFilterCount > 0 ? `${advancedFilterCount} đang dùng` : 'Dịch vụ, tồn kho, khoảng giá'}
                </span>
              </summary>
              <AdvancedFilterFields filters={filters} facets={catalogPage.facets} />
            </details>
          </form>

          <div className="mt-6 flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <h2 id="results-heading" className="text-2xl font-bold tracking-tight text-slate-950">
              {catalogPage.total === 0 ? 'Không tìm thấy sản phẩm' : `${catalogPage.total} phụ kiện phù hợp`}
            </h2>
            <p className="text-sm text-slate-500">
              Hiển thị <span className="font-semibold tabular-nums text-slate-800">{firstResult}–{lastResult}</span> / {catalogPage.total}
            </p>
          </div>

          {catalogPage.products.length > 0 ? (
            <div className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {catalogPage.products.map((item) => (
                <AccessoryCard
                  key={item.id}
                  product={item}
                  selectedVehicle={filters.vehicle ?? undefined}
                />
              ))}
            </div>
          ) : (
            <div className="mt-7 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
              <PackageSearch className="mx-auto h-11 w-11 text-slate-300" />
              <h3 className="mt-5 text-xl font-bold text-slate-950">Chưa có phụ kiện khớp bộ lọc</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                Hãy thử bỏ bớt một điều kiện hoặc chọn lại dòng xe.
              </p>
              <Link href="/accessories" className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-bold text-white hover:bg-brand-700">
                Xem toàn bộ phụ kiện <ArrowRight size={16} />
              </Link>
            </div>
          )}

          <Pagination
            currentPage={catalogPage.page}
            totalPages={catalogPage.totalPages}
            baseUrl="/accessories"
            query={accessorySearchParams(filters)}
          />
          </section>
        </div>

      </div>

      <Footer />
    </main>
  )
}
