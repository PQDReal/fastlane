import { Header } from '../../components/header'
import { Footer } from '../../components/footer'
import { ChevronRight } from 'lucide-react'
import Link from 'next/link'

export default function Loading() {
  return (
    <main className="flex min-h-screen flex-col bg-background pt-[74px]">
      <Header />

      <div className="relative bg-slate-50 py-12 md:py-16 overflow-hidden border-b border-slate-200">
        {/* Magic pattern background (Dot Grid) */}
        <div 
          className="absolute inset-0 opacity-[0.3]"
          style={{
            backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)',
            backgroundSize: '24px 24px'
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-50 to-transparent opacity-80" />
        
        <div className="relative z-10 mx-auto max-w-[1440px] px-6 lg:px-12 text-center flex flex-col items-center">
          <div className="flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-4 bg-white/60 backdrop-blur-sm px-4 py-1.5 rounded-full ring-1 ring-slate-200/50">
            <Link href="/" className="hover:text-brand-600 transition-colors">Trang chủ</Link>
            <ChevronRight size={12} />
            <span className="text-slate-900">Ô tô điện</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl md:text-6xl mb-4">
            Ô tô điện
          </h1>
          <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Khám phá dải sản phẩm ô tô điện toàn cầu từ Fastlane. Thiết kế tương lai, công nghệ vượt trội, kiến tạo chuẩn mực di chuyển mới.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[1440px] px-6 lg:px-12 py-16 w-full">
        <div className="flex justify-end mb-8">
          <div className="h-5 w-32 bg-slate-200 animate-pulse rounded"></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {Array.from({ length: 6 }).map((_, idx) => (
            <article key={idx} className="group h-full flex flex-col items-center text-center cursor-pointer pb-8">
              <div className="relative aspect-[4/3] w-full flex items-center justify-center overflow-hidden rounded-2xl bg-gray-50/50 p-4">
                <div className="w-[80%] h-[70%] bg-slate-200 animate-pulse rounded-lg"></div>
              </div>
              
              <div className="flex flex-col items-center mt-4 w-full flex-1">
                <div className="h-6 w-1/2 bg-slate-200 animate-pulse rounded mb-2 mt-1"></div>
                <div className="h-4 w-3/4 bg-slate-100 animate-pulse rounded mt-2"></div>
                <div className="h-4 w-2/3 bg-slate-100 animate-pulse rounded mt-1.5"></div>
                
                <div className="h-6 w-1/3 bg-slate-200 animate-pulse rounded mt-6"></div>
                
                <div className="mt-8 flex items-center justify-center gap-5 w-full">
                  <div className="h-3 w-16 bg-slate-200 animate-pulse rounded"></div>
                  <span className="w-px h-3 bg-muted-foreground/40"></span>
                  <div className="h-3 w-16 bg-slate-200 animate-pulse rounded"></div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      <Footer />
    </main>
  )
}
