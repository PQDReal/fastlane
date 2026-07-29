'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Search, SlidersHorizontal } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import { CatalogPagination } from '../../components/catalog-pagination'
import { VehicleCard } from '../../components/vehicle-card'
import {
  type BikePriceBand,
  matchesBikePriceBand,
  matchesCatalogSearch,
} from '../../lib/catalog-filtering'

const PAGE_SIZE = 12

const priceBands: Array<{
  value: BikePriceBand
  label: string
}> = [
  { value: 'all', label: 'Tất cả mức giá' },
  { value: 'under-15', label: 'Dưới 15 triệu' },
  { value: '15-25', label: '15 – dưới 25 triệu' },
  { value: '25-40', label: '25 – dưới 40 triệu' },
  { value: 'over-40', label: 'Từ 40 triệu' },
]

export type BikeCatalogItem = {
  name: string
  desc: string
  price: number
  image: string
  href: string
}

type BikeSort = 'name' | 'price-asc' | 'price-desc'

export function BikeCatalogBrowser({
  bikes,
}: {
  bikes: BikeCatalogItem[]
}) {
  const catalogRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [priceBand, setPriceBand] =
    useState<BikePriceBand>('all')
  const [sort, setSort] = useState<BikeSort>('name')
  const [filterOpen, setFilterOpen] = useState(false)
  const [page, setPage] = useState(1)

  const filteredBikes = useMemo(() => {
    const result = bikes.filter(
      (bike) =>
        matchesCatalogSearch(search, bike.name, bike.desc) &&
        matchesBikePriceBand(bike.price, priceBand),
    )

    return [...result].sort((left, right) => {
      if (sort === 'price-asc') return left.price - right.price
      if (sort === 'price-desc') return right.price - left.price
      return left.name.localeCompare(right.name, 'vi')
    })
  }, [bikes, priceBand, search, sort])

  const totalPages = Math.max(
    1,
    Math.ceil(filteredBikes.length / PAGE_SIZE),
  )
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const visibleBikes = filteredBikes.slice(
    pageStart,
    pageStart + PAGE_SIZE,
  )
  const hasActiveFilters =
    search.trim().length > 0 ||
    priceBand !== 'all' ||
    sort !== 'name'

  const updateSearch = (value: string) => {
    setSearch(value)
    setPage(1)
  }

  const resetFilters = () => {
    setSearch('')
    setPriceBand('all')
    setSort('name')
    setPage(1)
  }

  const changePage = (nextPage: number) => {
    setPage(nextPage)
    catalogRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  return (
    <div ref={catalogRef} className="scroll-mt-28">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex w-full flex-wrap items-center gap-4 md:w-auto">
          <div className="relative w-full md:w-[336px]">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
              size={18}
            />
            <input
              type="search"
              value={search}
              onChange={(event) => updateSearch(event.target.value)}
              placeholder="Tìm kiếm xe..."
              aria-label="Tìm kiếm xe máy điện"
              className="h-12 w-full rounded-full border border-muted bg-background pl-12 pr-4 outline-none transition-colors focus:border-brand-500"
            />
          </div>
          <button
            type="button"
            aria-expanded={filterOpen}
            aria-controls="bike-filter-panel"
            onClick={() => setFilterOpen((current) => !current)}
            className={`flex h-12 shrink-0 items-center gap-2 rounded-full border px-6 text-sm font-medium transition-colors ${
              filterOpen || priceBand !== 'all'
                ? 'border-foreground bg-foreground text-background'
                : 'border-muted hover:bg-muted'
            }`}
          >
            <SlidersHorizontal size={16} />
            Bộ lọc
            {priceBand !== 'all' && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">
                1
              </span>
            )}
          </button>
        </div>
        <p
          aria-live="polite"
          className="text-sm font-medium text-muted-foreground"
        >
          Hiển thị {filteredBikes.length} dòng xe
        </p>
      </div>

      <AnimatePresence initial={false}>
        {filterOpen && (
          <motion.section
            id="bike-filter-panel"
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="mb-10 overflow-hidden"
          >
            <div className="grid gap-6 rounded-2xl border border-muted bg-muted/30 p-5 md:grid-cols-[1fr_240px] md:items-end">
              <fieldset>
                <legend className="mb-3 text-sm font-bold">
                  Khoảng giá
                </legend>
                <div className="flex flex-wrap gap-2">
                  {priceBands.map((band) => (
                    <button
                      key={band.value}
                      type="button"
                      aria-pressed={priceBand === band.value}
                      onClick={() => {
                        setPriceBand(band.value)
                        setPage(1)
                      }}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                        priceBand === band.value
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-muted bg-background hover:border-foreground/40'
                      }`}
                    >
                      {band.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="text-sm font-bold">
                Sắp xếp
                <select
                  value={sort}
                  onChange={(event) => {
                    setSort(event.target.value as BikeSort)
                    setPage(1)
                  }}
                  className="mt-3 h-11 w-full rounded-xl border border-muted bg-background px-4 text-sm font-medium outline-none focus:border-brand-500"
                >
                  <option value="name">Tên A – Z</option>
                  <option value="price-asc">Giá: Thấp đến cao</option>
                  <option value="price-desc">Giá: Cao đến thấp</option>
                </select>
              </label>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {visibleBikes.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {visibleBikes.map((bike) => (
              <VehicleCard
                key={bike.href}
                {...bike}
                price={new Intl.NumberFormat('vi-VN').format(
                  bike.price,
                )}
              />
            ))}
          </div>
          <CatalogPagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={changePage}
          />
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-muted py-20 text-center">
          <h2 className="text-xl font-bold">
            Không tìm thấy dòng xe phù hợp
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Hãy thử từ khóa hoặc khoảng giá khác.
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="mt-6 rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background"
            >
              Xóa bộ lọc
            </button>
          )}
        </div>
      )}
    </div>
  )
}
