'use client'

import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
} from 'lucide-react'

type CatalogPaginationProps = {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}

export function CatalogPagination({
  currentPage,
  totalPages,
  onPageChange,
}: CatalogPaginationProps) {
  if (totalPages <= 1) return null

  const pages: Array<number | 'ellipsis-start' | 'ellipsis-end'> = []

  if (totalPages <= 5) {
    for (let page = 1; page <= totalPages; page += 1) {
      pages.push(page)
    }
  } else if (currentPage <= 3) {
    pages.push(1, 2, 3, 4, 'ellipsis-end', totalPages)
  } else if (currentPage >= totalPages - 2) {
    pages.push(
      1,
      'ellipsis-start',
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    )
  } else {
    pages.push(
      1,
      'ellipsis-start',
      currentPage - 1,
      currentPage,
      currentPage + 1,
      'ellipsis-end',
      totalPages,
    )
  }

  const changePage = (page: number) => {
    const nextPage = Math.min(totalPages, Math.max(1, page))
    if (nextPage === currentPage) return
    onPageChange(nextPage)
  }

  return (
    <nav
      aria-label="Phân trang danh mục"
      className="mt-12 flex items-center justify-center gap-2"
    >
      <button
        type="button"
        aria-label="Trang trước"
        disabled={currentPage <= 1}
        onClick={() => changePage(currentPage - 1)}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-muted text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:border-black/5 disabled:text-muted-foreground"
      >
        <ChevronLeft size={16} />
      </button>

      {pages.map((page) => {
        if (typeof page !== 'number') {
          return (
            <span
              key={page}
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center text-muted-foreground"
            >
              <MoreHorizontal size={16} />
            </span>
          )
        }

        const active = page === currentPage
        return (
          <button
            key={page}
            type="button"
            aria-label={`Trang ${page}`}
            aria-current={active ? 'page' : undefined}
            onClick={() => changePage(page)}
            className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium transition-colors ${
              active
                ? 'bg-foreground text-background shadow-sm'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {page}
          </button>
        )
      })}

      <button
        type="button"
        aria-label="Trang sau"
        disabled={currentPage >= totalPages}
        onClick={() => changePage(currentPage + 1)}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-muted text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:border-black/5 disabled:text-muted-foreground"
      >
        <ChevronRight size={16} />
      </button>
    </nav>
  )
}
