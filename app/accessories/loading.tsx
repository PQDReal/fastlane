import { Header } from '@/components/header'

export default function AccessoriesLoading() {
  return (
    <main className="min-h-screen bg-[#f6f7f9] pt-[74px]">
      <Header />
      <div className="motion-reduce:animate-none animate-pulse">
        <div className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-[1440px] px-6 py-9 lg:px-12 lg:py-11">
            <div className="h-3 w-36 rounded bg-slate-200" />
            <div className="mt-6 h-10 max-w-2xl rounded bg-slate-200 sm:h-12" />
            <div className="mt-3 h-4 max-w-xl rounded bg-slate-100" />
          </div>
        </div>
        <div className="h-24 bg-slate-900" />
        <div className="mx-auto grid max-w-[1440px] gap-8 px-6 py-10 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-12">
          <div className="hidden h-[620px] rounded-xl border border-slate-200 bg-white lg:block" />
          <div>
            <div className="h-16 rounded-xl border border-slate-200 bg-white" />
            <div className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="aspect-square bg-slate-100" />
                  <div className="space-y-3 p-5">
                    <div className="h-5 w-4/5 rounded bg-slate-200" />
                    <div className="h-4 w-full rounded bg-slate-100" />
                    <div className="h-11 rounded bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
