import { Header } from '../../components/header'
import { Footer } from '../../components/footer'
import { VehicleCard } from '../../components/vehicle-card'
import { Search, SlidersHorizontal, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { getSupabaseAdmin } from '../../lib/supabase-admin'

import { Pagination } from '../../components/pagination'

export const dynamic = 'force-dynamic'

export default async function CarsPage(props: { searchParams?: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const searchParams = await props.searchParams
  const pageParam = searchParams?.page
  const currentPage = typeof pageParam === 'string' ? parseInt(pageParam, 10) : 1
  const pageSize = 12
  const start = (currentPage - 1) * pageSize
  const end = start + pageSize - 1

  const supabase = getSupabaseAdmin()
  const { data: rawCars, count } = await supabase
    .from('products')
    .select(`*, category:categories!inner(name)`, { count: 'exact' })
    .eq('is_active', true)
    .eq('categories.name', 'Ô tô điện')
    .range(start, end)

  const carsData = (rawCars || []).sort((a, b) => {
    const numA = parseInt(a.name.match(/\d+/)?.[0] || '0', 10)
    const numB = parseInt(b.name.match(/\d+/)?.[0] || '0', 10)
    if (numA !== numB) return numA - numB
    return a.name.localeCompare(b.name)
  })
  const totalPages = count ? Math.ceil(count / pageSize) : 1

  const cars = carsData.map(c => {
    const { getProductImage, getCarSpecsSummary } = require('../../lib/get-product-image')
    const image = getProductImage(c.name, c.image_urls)
    const specsSummary = getCarSpecsSummary(c.name)
    
    return {
      name: c.name.toUpperCase().startsWith('VINFAST') ? c.name.toUpperCase() : `VINFAST ${c.name.toUpperCase()}`,
      desc: specsSummary || c.description || 'Xe ô tô điện VinFast',
      price: new Intl.NumberFormat('vi-VN').format(c.displayed_price),
      image,
      href: `/cars/${c.slug}`
    }
  })

  return (
    <main className="flex min-h-screen flex-col bg-background pt-[74px]">
      <Header />

      <div className="bg-muted py-24 border-b border-black/5">
        <div className="mx-auto max-w-[1440px] px-6 lg:px-12 text-center">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-8">
            <Link href="/" className="hover:text-brand-600 transition-colors">Trang chủ</Link>
            <ChevronRight size={14} />
            <span className="text-foreground">Ô tô điện</span>
          </div>
          <h1 className="text-5xl font-bold tracking-tight text-foreground sm:text-7xl">Ô tô điện</h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
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
            <VehicleCard key={idx} {...car} />
          ))}
        </div>

        <Pagination currentPage={currentPage} totalPages={totalPages} baseUrl="/cars" />
      </div>

      <Footer />
    </main>
  )
}
