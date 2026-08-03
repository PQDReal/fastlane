import { Header } from '../../components/header'
import { Footer } from '../../components/footer'
import { BatteryCharging, ChevronRight, Leaf, Zap } from 'lucide-react'
import Link from 'next/link'
import { listMotorbikeCatalog } from '../../lib/motorbike-catalog'
import { BikeCatalogBrowser } from './bike-catalog-browser'

export const revalidate = 300
// The catalog is read from Supabase at request time; Render may not expose
// production database networking during the build step.
export const dynamic = 'force-dynamic'

export default async function BikesPage() {
  const bikesData = await listMotorbikeCatalog()
  const bikes = bikesData.map((bike) => {
    return {
      name: bike.name,
      desc: bike.description || 'Xe máy điện VinFast',
      price: bike.displayedPrice,
      image: bike.listingImageUrl,
      href: `/bikes/${bike.slug}`,
    }
  })

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
            <span className="text-slate-900">Xe máy điện</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl md:text-6xl mb-4">
            Xe máy điện
          </h1>
          <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Giải pháp di chuyển đô thị thông minh, thân thiện với môi trường, thiết kế thời trang và vận hành êm ái.
          </p>
          <div className="mx-auto mt-10 grid max-w-2xl grid-cols-3 divide-x divide-black/10 rounded-2xl border border-black/5 bg-white/60 px-3 py-5 shadow-sm backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 px-2">
              <Zap size={19} className="text-brand-600" />
              <span className="text-xs font-semibold sm:text-sm">Vận hành êm ái</span>
            </div>
            <div className="flex flex-col items-center gap-2 px-2">
              <BatteryCharging size={19} className="text-brand-600" />
              <span className="text-xs font-semibold sm:text-sm">{bikes.length} dòng xe</span>
            </div>
            <div className="flex flex-col items-center gap-2 px-2">
              <Leaf size={19} className="text-brand-600" />
              <span className="text-xs font-semibold sm:text-sm">Không khí thải</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1440px] px-6 py-16 lg:px-12">
        <BikeCatalogBrowser bikes={bikes} />
      </div>

      <Footer />
    </main>
  )
}
