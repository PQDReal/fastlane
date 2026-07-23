import { Header } from '../../components/header'
import { Footer } from '../../components/footer'
import { VehicleCard } from '../../components/vehicle-card'
import { Search, SlidersHorizontal, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { getSupabaseAdmin } from '../../lib/supabase-admin'

import { Pagination } from '../../components/pagination'

export const dynamic = 'force-dynamic'

export default async function BikesPage({ searchParams }: { searchParams: { page?: string } }) {
  const currentPage = parseInt(searchParams?.page || '1', 10)
  const pageSize = 12
  const start = (currentPage - 1) * pageSize
  const end = start + pageSize - 1

  const supabase = getSupabaseAdmin()
  const { data: rawBikes, count } = await supabase
    .from('products')
    .select(`*, category:categories!inner(name)`, { count: 'exact' })
    .eq('is_active', true)
    .eq('categories.name', 'Xe máy điện')
    .range(start, end)
  
  const bikesData = rawBikes || []
  const totalPages = count ? Math.ceil(count / pageSize) : 1

  const bikes = bikesData.map(c => ({
    name: c.name,
    desc: c.description || 'Xe máy điện VinFast',
    price: new Intl.NumberFormat('vi-VN').format(c.displayed_price),
    image: c.image_urls && c.image_urls.length > 0 && c.image_urls[0].match(/\.(jpeg|jpg|gif|png|webp|svg)$/i) ? c.image_urls[0] : '/images/vento.png',
  }))

  return (
    <main className="flex min-h-screen flex-col bg-background pt-[74px]">
      <Header />
      
      <div className="bg-muted py-24 border-b border-black/5">
        <div className="mx-auto max-w-[1440px] px-6 lg:px-12 text-center">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-8">
            <Link href="/" className="hover:text-brand-600 transition-colors">Trang chủ</Link>
            <ChevronRight size={14} />
            <span className="text-foreground">Xe máy điện</span>
          </div>
          <h1 className="text-5xl font-bold tracking-tight text-foreground sm:text-7xl">Xe máy điện</h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            Giải pháp di chuyển đô thị thông minh, thân thiện với môi trường, thiết kế thời trang và vận hành êm ái.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[1440px] px-6 lg:px-12 py-16 w-full">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-12">
          <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
            <div className="relative w-full md:w-[300px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <input type="text" placeholder="Tìm kiếm xe..." className="w-full h-12 pl-12 pr-4 rounded-full border border-muted bg-background focus:outline-none focus:border-brand-500 transition-colors" />
            </div>
            <button className="h-12 px-6 rounded-full border border-muted flex items-center gap-2 hover:bg-muted transition-colors font-medium text-sm shrink-0">
              <SlidersHorizontal size={16} />
              Bộ lọc
            </button>
          </div>
          <div className="text-sm text-muted-foreground font-medium">
            Hiển thị {bikes.length} dòng xe
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {bikes.map((bike, idx) => (
             <VehicleCard key={idx} {...bike} />
          ))}
        </div>
        
        <Pagination currentPage={currentPage} totalPages={totalPages} baseUrl="/bikes" />
      </div>

      <Footer />
    </main>
  )
}
