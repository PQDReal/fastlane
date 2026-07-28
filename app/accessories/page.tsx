import {
  ArrowRight,
  ChevronRight,
  PackageSearch,
  SlidersHorizontal,
} from 'lucide-react'
import Link from 'next/link'

import { AccessoryCategoryNavigation } from '@/components/accessory-category-navigation'
import { AccessoryCard } from '@/components/accessory-card'
import { AccessorySearchInput } from '@/components/accessory-search-input'
import { AccessoryServiceStockFilters } from '@/components/accessory-service-stock-filters'
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

export const dynamic = 'force-dynamic'

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
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-[minmax(240px,1fr)_220px]">
              <AccessorySearchInput filters={filters} />
              <AccessorySortSelect filters={filters} />
            </div>

            <details open={advancedFilterCount > 0 || undefined} className="mt-3">
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between rounded-lg px-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2">
                  <SlidersHorizontal size={16} /> Bộ lọc nâng cao
                </span>
                <span className="text-xs font-medium text-slate-400">
                  {advancedFilterCount > 0 ? `${advancedFilterCount} đang dùng` : 'Dịch vụ, tồn kho'}
                </span>
              </summary>
              <AccessoryServiceStockFilters
                filters={filters}
                facets={catalogPage.facets}
              />
            </details>
          </div>

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
