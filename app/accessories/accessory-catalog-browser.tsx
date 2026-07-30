'use client'

import { Search } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import { AccessoryCard } from '../../components/accessory-card'
import { CatalogPagination } from '../../components/catalog-pagination'
import {
  ACCESSORY_CATEGORIES,
  classifyAccessory,
  getAccessoryMinimumPrice,
  getAccessoryPopularity,
  matchesCatalogSearch,
} from '../../lib/catalog-filtering'
import type { CatalogProduct } from '../../lib/catalog/types'
import {
  AccessoryFilters,
  DEFAULT_ACCESSORY_BUDGET,
} from './accessory-filters'

const PAGE_SIZE = 12

type AccessorySort =
  | 'newest'
  | 'price-asc'
  | 'price-desc'
  | 'popular'

export function AccessoryCatalogBrowser({
  products,
}: {
  products: CatalogProduct[]
}) {
  const catalogRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<
    string[]
  >(['Tất cả'])
  const [budget, setBudget] = useState(DEFAULT_ACCESSORY_BUDGET)
  const [sort, setSort] = useState<AccessorySort>('newest')
  const [page, setPage] = useState(1)

  const indexedProducts = useMemo(
    () =>
      products.map((product, index) => ({
        product,
        index,
        category: classifyAccessory(product),
      })),
    [products],
  )

  const filteredProducts = useMemo(() => {
    const showAll = selectedCategories.includes('Tất cả')
    const result = indexedProducts.filter(
      ({ product, category }) =>
        (showAll || selectedCategories.includes(category)) &&
        getAccessoryMinimumPrice(product) <= budget &&
        matchesCatalogSearch(
          search,
          product.name,
          product.description,
          product.variants.map((variant) => variant.sku).join(' '),
        ),
    )

    return [...result].sort((left, right) => {
      if (sort === 'price-asc') {
        return (
          getAccessoryMinimumPrice(left.product) -
          getAccessoryMinimumPrice(right.product)
        )
      }
      if (sort === 'price-desc') {
        return (
          getAccessoryMinimumPrice(right.product) -
          getAccessoryMinimumPrice(left.product)
        )
      }
      if (sort === 'popular') {
        const stockDifference =
          getAccessoryPopularity(right.product) -
          getAccessoryPopularity(left.product)
        return stockDifference || left.index - right.index
      }
      const leftCreatedAt = Date.parse(
        left.product.createdAt ?? '',
      )
      const rightCreatedAt = Date.parse(
        right.product.createdAt ?? '',
      )
      const newestDifference =
        (Number.isFinite(rightCreatedAt) ? rightCreatedAt : 0) -
        (Number.isFinite(leftCreatedAt) ? leftCreatedAt : 0)
      return newestDifference || left.index - right.index
    })
  }, [budget, indexedProducts, search, selectedCategories, sort])

  const totalPages = Math.max(
    1,
    Math.ceil(filteredProducts.length / PAGE_SIZE),
  )
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const visibleProducts = filteredProducts.slice(
    pageStart,
    pageStart + PAGE_SIZE,
  )
  const resultStart =
    filteredProducts.length === 0 ? 0 : pageStart + 1
  const resultEnd = Math.min(
    pageStart + PAGE_SIZE,
    filteredProducts.length,
  )

  const updateCategories = (categories: string[]) => {
    setSelectedCategories(categories)
    setPage(1)
  }

  const updateBudget = (value: number) => {
    setBudget(value)
    setPage(1)
  }

  const resetFilters = () => {
    setSearch('')
    setSelectedCategories(['Tất cả'])
    setBudget(DEFAULT_ACCESSORY_BUDGET)
    setSort('newest')
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
    <div
      ref={catalogRef}
      className="mx-auto flex w-full max-w-[1440px] scroll-mt-28 flex-col gap-12 px-6 py-12 md:flex-row lg:px-12"
    >
      <aside className="w-full shrink-0 md:w-72">
        <AccessoryFilters
          categories={ACCESSORY_CATEGORIES}
          selectedCategories={selectedCategories}
          onSelectedCategoriesChange={updateCategories}
          budget={budget}
          onBudgetChange={updateBudget}
        />
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mb-8 flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="relative w-full sm:w-[350px]">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
              size={16}
            />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="Tìm kiếm phụ kiện..."
              aria-label="Tìm kiếm phụ kiện"
              className="h-11 w-full rounded-full border border-muted bg-background pl-11 pr-4 text-sm outline-none transition-colors focus:border-brand-500"
            />
          </div>

          <div className="flex w-full items-center gap-4 sm:w-auto">
            <span
              aria-live="polite"
              className="hidden whitespace-nowrap text-sm font-medium text-muted-foreground lg:inline"
            >
              {filteredProducts.length === 0
                ? 'Hiển thị 0 kết quả'
                : `Hiển thị ${resultStart}–${resultEnd} trên ${filteredProducts.length} kết quả`}
            </span>
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as AccessorySort)
                setPage(1)
              }}
              aria-label="Sắp xếp phụ kiện"
              className="h-11 w-full rounded-full border border-muted bg-background px-4 text-sm font-medium outline-none focus:border-brand-500 sm:w-auto"
            >
              <option value="newest">Mới nhất</option>
              <option value="price-asc">Giá: Thấp đến cao</option>
              <option value="price-desc">Giá: Cao đến thấp</option>
              <option value="popular">Bán chạy nhất</option>
            </select>
          </div>
        </div>

        {visibleProducts.length > 0 ? (
          <>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleProducts.map(({ product }) => (
                <AccessoryCard key={product.id} product={product} />
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
              Không tìm thấy phụ kiện phù hợp
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Hãy thử từ khóa, danh mục hoặc ngân sách khác.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-6 rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background"
            >
              Xóa bộ lọc
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
