import { Header } from '../../components/header'
import { Footer } from '../../components/footer'
import { CarVehicleCard } from '../../components/car-vehicle-card'
import { Search, SlidersHorizontal, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { Pagination } from '../../components/pagination'
import { listCarCatalogPage } from '../../lib/car-catalog'

export const dynamic = 'force-dynamic'

export default async function CarsPage(props: { searchParams?: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const searchParams = await props.searchParams
  const pageParam = searchParams?.page
  const currentPage = typeof pageParam === 'string' ? parseInt(pageParam, 10) : 1
  const pageSize = 12
  const catalog = await listCarCatalogPage(currentPage, pageSize)
  const totalPages = Math.max(1, Math.ceil(catalog.total / pageSize))
  const cars = catalog.items.map((car) => ({
    name: car.name.toUpperCase().startsWith('VINFAST') ? car.name.toUpperCase() : `VINFAST ${car.name.toUpperCase()}`,
    desc: car.description,
    price: new Intl.NumberFormat('vi-VN').format(car.displayedPrice),
    image: car.imageUrl,
    href: `/cars/${car.slug}`,
  }))

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
          <div className="text-sm text-muted-foreground font-medium">
            Hiển thị {cars.length} dòng xe
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {cars.map((car, idx) => (
            <CarVehicleCard key={car.href || idx} {...car} />
          ))}
        </div>

        <Pagination currentPage={currentPage} totalPages={totalPages} baseUrl="/cars" />
      </div>

      <Footer />
    </main>
  )
}
