import Link from 'next/link'
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react'

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  baseUrl: string;
  query?: URLSearchParams | Record<string, string | string[] | undefined>;
}

export function Pagination({ currentPage, totalPages, baseUrl, query }: PaginationProps) {
  if (totalPages <= 1) return null;

  const href = (page: number) => {
    const params = query instanceof URLSearchParams
      ? new URLSearchParams(query)
      : new URLSearchParams()
    if (query && !(query instanceof URLSearchParams)) {
      for (const [key, value] of Object.entries(query)) {
        if (Array.isArray(value)) value.forEach((item) => params.append(key, item))
        else if (value) params.set(key, value)
      }
    }
    params.set('page', String(page))
    return `${baseUrl}?${params.toString()}`
  }

  const getPages = () => {
    const pages = [];
    const showMax = 5;
    
    if (totalPages <= showMax) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        pages.push(1, 2, 3, 4, '...', totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
      }
    }
    return pages;
  };

  return (
    <nav aria-label="Phân trang" className="mt-12 flex items-center justify-center gap-2">
      <Link 
        href={currentPage > 1 ? href(currentPage - 1) : '#'}
        aria-label="Trang trước"
        aria-disabled={currentPage <= 1}
        className={`flex h-11 w-11 items-center justify-center rounded-full border transition-colors ${currentPage > 1 ? 'border-muted hover:bg-muted text-foreground' : 'border-black/5 text-muted-foreground pointer-events-none'}`}
      >
        <ChevronLeft size={16} />
      </Link>
      
      {getPages().map((p, i) => {
        if (p === '...') {
          return (
            <div key={`ellipsis-${i}`} className="flex h-11 w-11 items-center justify-center text-muted-foreground">
              <MoreHorizontal size={16} />
            </div>
          );
        }
        
        const isActive = p === currentPage;
        return (
          <Link 
            key={p}
            href={href(Number(p))}
            aria-current={isActive ? 'page' : undefined}
            aria-label={`Trang ${p}`}
            className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-medium transition-colors ${isActive ? 'bg-foreground text-background shadow-sm' : 'hover:bg-muted text-muted-foreground'}`}
          >
            {p}
          </Link>
        );
      })}
      
      <Link 
        href={currentPage < totalPages ? href(currentPage + 1) : '#'}
        aria-label="Trang sau"
        aria-disabled={currentPage >= totalPages}
        className={`flex h-11 w-11 items-center justify-center rounded-full border transition-colors ${currentPage < totalPages ? 'border-muted hover:bg-muted text-foreground' : 'border-black/5 text-muted-foreground pointer-events-none'}`}
      >
        <ChevronRight size={16} />
      </Link>
    </nav>
  )
}
