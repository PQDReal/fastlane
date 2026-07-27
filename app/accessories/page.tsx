import {
  ArrowRight,
  CarFront,
  ChevronRight,
  PackageSearch,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import Link from 'next/link'

import { AccessoryCard } from '@/components/accessory-card'
import { Footer } from '@/components/footer'
import { Header } from '@/components/header'
import { Pagination } from '@/components/pagination'
import {
  accessoryCatalogHref,
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

const formatPrice = (price: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(price)

function HiddenFilters({
  filters,
  exclude = [],
}: {
  filters: AccessoryCatalogFilters
  exclude?: string[]
}) {
  const excluded = new Set(exclude)
  return [...accessorySearchParams(filters).entries()].flatMap(([name, value]) => (
    excluded.has(name) ? [] : [
      <input key={name} type="hidden" name={name} value={value} />,
    ]
  ))
}

function FilterControls({
  filters,
  facets,
  idPrefix,
}: {
  filters: AccessoryCatalogFilters
  facets: AccessoryCatalogFacets
  idPrefix: string
}) {
  const stockOptions = [
    { value: 'all', label: 'Tất cả tình trạng' },
    { value: 'in-stock', label: 'Đang có hàng' },
    { value: 'out-of-stock', label: 'Tạm hết hàng' },
  ] as const

  return (
    <>
      <fieldset>
        <legend className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
          Danh mục
        </legend>
        <div className="mt-4 space-y-1">
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 text-sm hover:bg-slate-50">
            <span className="flex items-center gap-3">
              <input
                type="radio"
                name="category"
                value=""
                defaultChecked={!filters.category}
                className="h-4 w-4 accent-brand-600"
              />
              Tất cả
            </span>
            <span className="text-xs tabular-nums text-slate-400">{facets.total}</span>
          </label>
          {facets.categories.map((category) => (
            <label key={category.value} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 text-sm hover:bg-slate-50">
              <span className="flex min-w-0 items-center gap-3">
                <input
                  type="radio"
                  name="category"
                  value={category.value}
                  defaultChecked={filters.category === category.value}
                  className="h-4 w-4 shrink-0 accent-brand-600"
                />
                <span className="line-clamp-2">{category.value}</span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-slate-400">{category.count}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {facets.services.length > 0 && (
        <fieldset className="mt-8 border-t border-slate-200 pt-7">
          <legend className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            Dịch vụ
          </legend>
          <div className="mt-4 space-y-1">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm hover:bg-slate-50">
              <input
                type="radio"
                name="service"
                value=""
                defaultChecked={!filters.service}
                className="h-4 w-4 accent-brand-600"
              />
              Tất cả dịch vụ
            </label>
            {facets.services.map((service) => (
              <label key={service.value} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 text-sm hover:bg-slate-50">
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="service"
                    value={service.value}
                    defaultChecked={filters.service === service.value}
                    className="h-4 w-4 accent-brand-600"
                  />
                  {service.value}
                </span>
                <span className="text-xs tabular-nums text-slate-400">{service.count}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="mt-8 border-t border-slate-200 pt-7">
        <legend className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
          Tình trạng kho
        </legend>
        <div className="mt-4 space-y-1">
          {stockOptions.map((option) => (
            <label key={option.value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm hover:bg-slate-50">
              <input
                type="radio"
                name="stock"
                value={option.value}
                defaultChecked={filters.stock === option.value}
                className="h-4 w-4 accent-brand-600"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-8 border-t border-slate-200 pt-7">
        <legend className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
          Khoảng giá
        </legend>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <label htmlFor={`${idPrefix}-minimum-price`} className="text-xs font-semibold text-slate-500">
            Từ
            <input
              id={`${idPrefix}-minimum-price`}
              type="number"
              name="minPrice"
              min="0"
              step="1000"
              defaultValue={filters.minimumPrice ?? ''}
              placeholder={facets.minimumPrice === null ? '0' : String(facets.minimumPrice)}
              className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <label htmlFor={`${idPrefix}-maximum-price`} className="text-xs font-semibold text-slate-500">
            Đến
            <input
              id={`${idPrefix}-maximum-price`}
              type="number"
              name="maxPrice"
              min="0"
              step="1000"
              defaultValue={filters.maximumPrice ?? ''}
              placeholder={facets.maximumPrice === null ? '0' : String(facets.maximumPrice)}
              className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </label>
        </div>
        {facets.minimumPrice !== null && facets.maximumPrice !== null && (
          <p className="mt-2 text-[11px] text-slate-400">
            Dữ liệu hiện có: {formatPrice(facets.minimumPrice)} – {formatPrice(facets.maximumPrice)}
          </p>
        )}
      </fieldset>

      <div className="mt-8 grid grid-cols-2 gap-2">
        <Link
          href={filters.vehicle
            ? accessoryCatalogHref(parseAccessoryFilters({ vehicle: filters.vehicle }))
            : '/accessories'}
          className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-bold text-slate-600 hover:border-slate-900 hover:text-slate-950"
        >
          Đặt lại
        </Link>
        <button
          type="submit"
          className="h-11 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-brand-700"
        >
          Áp dụng
        </button>
      </div>
    </>
  )
}

function activeFilterChips(filters: AccessoryCatalogFilters) {
  return [
    filters.query && {
      label: `“${filters.query}”`,
      href: accessoryCatalogHref(filters, { q: null, page: null }),
    },
    filters.category && {
      label: filters.category,
      href: accessoryCatalogHref(filters, { category: null, page: null }),
    },
    filters.vehicle && {
      label: `Xe ${filters.vehicle}`,
      href: accessoryCatalogHref(filters, { vehicle: null, page: null }),
    },
    filters.service && {
      label: filters.service,
      href: accessoryCatalogHref(filters, { service: null, page: null }),
    },
    filters.stock !== 'all' && {
      label: filters.stock === 'in-stock' ? 'Đang có hàng' : 'Tạm hết hàng',
      href: accessoryCatalogHref(filters, { stock: null, page: null }),
    },
    filters.minimumPrice !== null && {
      label: `Từ ${formatPrice(filters.minimumPrice)}`,
      href: accessoryCatalogHref(filters, { minPrice: null, page: null }),
    },
    filters.maximumPrice !== null && {
      label: `Đến ${formatPrice(filters.maximumPrice)}`,
      href: accessoryCatalogHref(filters, { maxPrice: null, page: null }),
    },
  ].filter((item): item is { label: string; href: string } => Boolean(item))
}

export default async function AccessoriesPage({
  searchParams,
}: {
  searchParams?: Promise<AccessorySearchParams>
}) {
  const resolvedSearchParams = await searchParams
  const filters = parseAccessoryFilters(resolvedSearchParams)
  const catalogPage = await listAccessoryCatalog({
    page: parseAccessoryPage(resolvedSearchParams),
    pageSize: 12,
    filters,
  })
  const chips = activeFilterChips(filters)
  const firstResult = catalogPage.total === 0
    ? 0
    : (catalogPage.page - 1) * catalogPage.pageSize + 1
  const lastResult = Math.min(
    catalogPage.total,
    catalogPage.page * catalogPage.pageSize,
  )

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

          <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">Phụ kiện chính hãng</p>
              <h1 className="mt-2 text-4xl font-bold tracking-[-0.03em] text-slate-950 sm:text-5xl">
                Phụ kiện cho xe của bạn
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-500 sm:text-base">
                Chọn dòng xe để xem đúng sản phẩm, sau đó mở chi tiết để cấu hình và đặt mua.
              </p>
            </div>
            <p className="text-sm text-slate-500">
              <span className="font-bold tabular-nums text-slate-900">{catalogPage.facets.total}</span> sản phẩm · {catalogPage.facets.vehicles.length} dòng xe
            </p>
          </div>
        </div>
      </header>

      <section aria-labelledby="garage-heading" className="border-b border-brand-900/20 bg-slate-950 text-white">
        <form action="/accessories" method="get" className="mx-auto grid max-w-[1440px] gap-4 px-6 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,520px)] lg:items-center lg:px-12">
          <HiddenFilters filters={filters} exclude={['vehicle']} />
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-600 text-white">
              <CarFront size={20} />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-300">Chọn theo xe</p>
              <h2 id="garage-heading" className="mt-0.5 text-base font-bold sm:text-lg">
                {filters.vehicle ? `Đang xem phụ kiện cho ${filters.vehicle}` : 'Xe nào đang ở trong garage của bạn?'}
              </h2>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="garage-vehicle" className="sr-only">Chọn dòng xe</label>
            <select
              id="garage-vehicle"
              name="vehicle"
              defaultValue={filters.vehicle ?? ''}
              className="h-12 min-w-0 flex-1 rounded-lg border border-white/20 bg-white px-4 text-sm font-semibold text-slate-950 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/30"
            >
              <option value="">Tất cả dòng xe</option>
              {catalogPage.facets.vehicles.map((vehicle) => (
                <option key={vehicle.value} value={vehicle.value}>
                  {vehicle.value} — {vehicle.count} phụ kiện
                </option>
              ))}
            </select>
            <button type="submit" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-bold text-white transition hover:bg-brand-500">
              Áp dụng <ArrowRight size={17} />
            </button>
          </div>
        </form>
      </section>

      <div className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-8 lg:px-12 lg:py-10">
        <details className="mb-5 rounded-xl border border-slate-200 bg-white lg:hidden">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-4 font-bold text-slate-900 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2"><SlidersHorizontal size={18} /> Bộ lọc sản phẩm</span>
            <span className="text-xs text-slate-400">{chips.length} đang dùng</span>
          </summary>
          <form action="/accessories" method="get" className="border-t border-slate-200 p-4">
            <HiddenFilters filters={filters} exclude={['category', 'service', 'stock', 'minPrice', 'maxPrice']} />
            <FilterControls filters={filters} facets={catalogPage.facets} idPrefix="mobile" />
          </form>
        </details>

        <div className="grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)] xl:gap-10">
          <aside className="hidden lg:block">
            <form action="/accessories" method="get" className="sticky top-[98px] rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-7 flex items-center justify-between border-b border-slate-200 pb-5">
                <h2 className="flex items-center gap-2 font-bold text-slate-950">
                  <SlidersHorizontal size={17} /> Bộ lọc
                </h2>
                <span className="text-xs tabular-nums text-slate-400">{catalogPage.facets.total} mục</span>
              </div>
              <HiddenFilters filters={filters} exclude={['category', 'service', 'stock', 'minPrice', 'maxPrice']} />
              <FilterControls filters={filters} facets={catalogPage.facets} idPrefix="desktop" />
            </form>
          </aside>

          <section aria-labelledby="results-heading" className="min-w-0">
            <form action="/accessories" method="get" className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_220px_auto]">
              <HiddenFilters filters={filters} exclude={['q', 'sort']} />
              <label className="relative block">
                <span className="sr-only">Tìm phụ kiện</span>
                <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  type="search"
                  name="q"
                  defaultValue={filters.query}
                  placeholder="Tên, SKU hoặc dòng xe..."
                  className="h-12 w-full rounded-lg border border-slate-200 pl-11 pr-4 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </label>
              <label>
                <span className="sr-only">Sắp xếp</span>
                <select
                  name="sort"
                  defaultValue={filters.sort}
                  className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                >
                  <option value="name-asc">Tên A–Z</option>
                  <option value="price-asc">Giá thấp đến cao</option>
                  <option value="price-desc">Giá cao đến thấp</option>
                </select>
              </label>
              <button type="submit" className="h-12 rounded-lg bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-brand-700">
                Tìm kiếm
              </button>
            </form>

            <div className="mt-6 flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <h2 id="results-heading" className="text-2xl font-bold tracking-tight text-slate-950">
                {catalogPage.total === 0 ? 'Không tìm thấy sản phẩm' : `${catalogPage.total} phụ kiện phù hợp`}
              </h2>
              <p className="text-sm text-slate-500">
                Hiển thị <span className="font-semibold tabular-nums text-slate-800">{firstResult}–{lastResult}</span> / {catalogPage.total}
              </p>
            </div>

            {chips.length > 0 && (
              <div aria-label="Bộ lọc đang áp dụng" className="mt-4 flex flex-wrap gap-2">
                {chips.map((chip) => (
                  <Link
                    key={`${chip.label}-${chip.href}`}
                    href={chip.href}
                    className="inline-flex min-h-9 items-center gap-2 rounded-md border border-brand-200 bg-brand-50 px-3 text-xs font-bold text-brand-800 transition hover:border-brand-400"
                  >
                    {chip.label} <X size={13} aria-hidden="true" />
                  </Link>
                ))}
                <Link href="/accessories" className="inline-flex min-h-9 items-center px-2 text-xs font-bold text-slate-500 underline decoration-slate-300 underline-offset-4 hover:text-slate-950">
                  Xóa tất cả
                </Link>
              </div>
            )}

            {catalogPage.products.length > 0 ? (
              <div className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
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
