import Link from 'next/link'
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react'

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  baseUrl: string;
}

export function Pagination({ currentPage, totalPages, baseUrl }: PaginationProps) {
  if (totalPages <= 1) return null;

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
    <div className="flex items-center justify-center gap-2 mt-12">
      <Link 
        href={currentPage > 1 ? `${baseUrl}?page=${currentPage - 1}` : '#'} 
        className={`w-10 h-10 flex items-center justify-center rounded-full border transition-colors ${currentPage > 1 ? 'border-muted hover:bg-muted text-foreground' : 'border-black/5 text-muted-foreground pointer-events-none'}`}
      >
        <ChevronLeft size={16} />
      </Link>
      
      {getPages().map((p, i) => {
        if (p === '...') {
          return (
            <div key={`ellipsis-${i}`} className="w-10 h-10 flex items-center justify-center text-muted-foreground">
              <MoreHorizontal size={16} />
            </div>
          );
        }
        
        const isActive = p === currentPage;
        return (
          <Link 
            key={p}
            href={`${baseUrl}?page=${p}`}
            className={`w-10 h-10 flex items-center justify-center rounded-full font-medium text-sm transition-colors ${isActive ? 'bg-foreground text-background shadow-sm' : 'hover:bg-muted text-muted-foreground'}`}
          >
            {p}
          </Link>
        );
      })}
      
      <Link 
        href={currentPage < totalPages ? `${baseUrl}?page=${currentPage + 1}` : '#'} 
        className={`w-10 h-10 flex items-center justify-center rounded-full border transition-colors ${currentPage < totalPages ? 'border-muted hover:bg-muted text-foreground' : 'border-black/5 text-muted-foreground pointer-events-none'}`}
      >
        <ChevronRight size={16} />
      </Link>
    </div>
  )
}
