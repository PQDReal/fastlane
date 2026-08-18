export default function ArticleLoading() {
  return (
    <div className="w-full p-6 md:p-8 lg:p-10 pb-24 flex flex-col lg:flex-row gap-10 animate-pulse">
      {/* Content Skeleton */}
      <div className="flex-1 min-w-0">
        <div className="h-10 bg-slate-200 rounded-sm w-3/4 mb-6"></div>
        <div className="space-y-4">
          <div className="h-4 bg-slate-200 rounded w-full"></div>
          <div className="h-4 bg-slate-200 rounded w-full"></div>
          <div className="h-4 bg-slate-200 rounded w-5/6"></div>
          <div className="h-4 bg-slate-200 rounded w-4/6 mb-8"></div>
          
          <div className="h-48 bg-slate-200 rounded-sm w-full mb-6"></div>
          
          <div className="h-4 bg-slate-200 rounded w-full"></div>
          <div className="h-4 bg-slate-200 rounded w-full"></div>
          <div className="h-4 bg-slate-200 rounded w-3/4"></div>
        </div>
      </div>
      
      {/* TOC / Right Sidebar Skeleton */}
      <div className="hidden lg:block w-64 shrink-0">
        <div className="sticky top-24">
          <div className="h-5 bg-slate-200 rounded w-1/2 mb-4"></div>
          <div className="space-y-3">
            <div className="h-3 bg-slate-200 rounded w-full"></div>
            <div className="h-3 bg-slate-200 rounded w-5/6"></div>
            <div className="h-3 bg-slate-200 rounded w-4/6"></div>
          </div>
        </div>
      </div>
    </div>
  )
}
