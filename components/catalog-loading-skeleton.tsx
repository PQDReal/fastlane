export function CatalogLoadingSkeleton({ cards = 8 }: { cards?: number }) {
  return (
    <main className="min-h-screen bg-slate-50 pt-[74px]" aria-busy="true" aria-label="Đang tải danh mục">
      <div className="border-b border-slate-200 bg-white px-6 py-14">
        <div className="mx-auto max-w-[1440px] animate-pulse">
          <div className="h-3 w-36 rounded-full bg-slate-200" />
          <div className="mt-5 h-10 w-72 max-w-full rounded-xl bg-slate-200" />
          <div className="mt-4 h-4 w-[480px] max-w-full rounded-full bg-slate-100" />
        </div>
      </div>
      <div className="mx-auto max-w-[1440px] px-6 py-12">
        <div className="mb-8 h-12 w-full max-w-md animate-pulse rounded-full bg-slate-200" />
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: cards }, (_, index) => (
            <div key={index} className="animate-pulse">
              <div className="aspect-[4/3] rounded-2xl bg-slate-200" />
              <div className="mx-auto mt-5 h-5 w-2/3 rounded-full bg-slate-200" />
              <div className="mx-auto mt-3 h-4 w-1/2 rounded-full bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
