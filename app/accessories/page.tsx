import { Header } from '../../components/header'
import { Footer } from '../../components/footer'
import { AccessoryCard } from '../../components/accessory-card'
import { Search, SlidersHorizontal, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { getSupabaseAdmin } from '../../lib/supabase-admin'

import { Pagination } from '../../components/pagination'

export const dynamic = 'force-dynamic'

const categories = ["Tất cả", "Sạc & Cáp", "Nội thất", "Ngoại thất", "Đồ dã ngoại", "Quần áo thời trang"]

export default async function AccessoriesPage(props: { searchParams?: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const searchParams = await props.searchParams
  const pageParam = searchParams?.page
  const currentPage = typeof pageParam === 'string' ? parseInt(pageParam, 10) : 1
  const pageSize = 12
  const start = (currentPage - 1) * pageSize
  const end = start + pageSize - 1

  const supabase = getSupabaseAdmin()
  const { data: rawAccessories, count } = await supabase
    .from('products')
    .select(`*, category:categories!inner(name)`, { count: 'exact' })
    .eq('is_active', true)
    .eq('categories.name', 'Phụ kiện')
    .range(start, end)
  
  const accessoriesData = rawAccessories || []
  const totalPages = count ? Math.ceil(count / pageSize) : 1

  const accessories = accessoriesData.map(c => ({
    name: c.name,
    price: new Intl.NumberFormat('vi-VN').format(c.displayed_price),
    oldPrice: null,
    discount: null,
    image: c.image_urls && c.image_urls.length > 0 && c.image_urls[0].match(/\.(jpeg|jpg|gif|png|webp|svg)$/i) ? c.image_urls[0] : '/images/vf8.png',
    rating: 4.8,
    stock: c.stock,
  }))

  return (
    <main className="flex min-h-screen flex-col bg-background pt-[74px]">
      <Header />
      
      <div className="bg-muted py-20 border-b border-black/5">
        <div className="mx-auto max-w-[1440px] px-6 lg:px-12 text-center">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-6">
            <Link href="/" className="hover:text-brand-600 transition-colors">Trang chủ</Link>
            <ChevronRight size={14} />
            <span className="text-foreground">Phụ kiện chính hãng</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-6xl">Phụ kiện chính hãng</h1>
          <p className="mt-4 text-base text-muted-foreground max-w-2xl mx-auto">
            Cá nhân hóa chiếc xe của bạn với bộ sưu tập phụ kiện cao cấp, được thiết kế độc quyền cho các dòng xe Fastlane.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[1440px] px-6 lg:px-12 py-12 w-full flex flex-col md:flex-row gap-12">
        {/* Sidebar Filters */}
        <aside className="w-full md:w-64 shrink-0">
          <div className="sticky top-[100px]">
            <h3 className="text-lg font-bold text-foreground mb-6 tracking-tight">Danh mục</h3>
            <ul className="space-y-3">
              {categories.map((cat, i) => (
                <li key={i}>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input type="checkbox" className="w-4 h-4 rounded border-muted-foreground/30 text-brand-600 focus:ring-brand-500 accent-foreground cursor-pointer" defaultChecked={i === 0} />
                    <span className={`text-sm font-medium transition-colors group-hover:text-foreground ${i === 0 ? 'text-foreground' : 'text-muted-foreground'}`}>{cat}</span>
                  </label>
                </li>
              ))}
            </ul>

            <h3 className="text-lg font-bold text-foreground mt-10 mb-6 tracking-tight">Khoảng giá</h3>
            <div className="space-y-4">
              <input type="range" min="0" max="20000000" className="w-full accent-foreground" />
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span>0 ₫</span>
                <span>20.000.000 ₫</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Product Grid */}
        <div className="flex-1">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-8">
            <div className="relative w-full sm:w-[350px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <input type="text" placeholder="Tìm kiếm phụ kiện..." className="w-full h-11 pl-11 pr-4 rounded-full border border-muted bg-background focus:outline-none focus:border-brand-500 transition-colors text-sm" />
            </div>
            
            <div className="flex items-center gap-4 w-full sm:w-auto">
              <span className="text-sm text-muted-foreground font-medium hidden lg:inline">Hiển thị {accessories.length} kết quả</span>
              <select className="h-11 px-4 rounded-full border border-muted bg-background text-sm font-medium focus:outline-none focus:border-brand-500">
                <option>Mới nhất</option>
                <option>Giá: Thấp đến cao</option>
                <option>Giá: Cao đến thấp</option>
                <option>Bán chạy nhất</option>
              </select>
            </div>
          </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {accessories.map((item, idx) => (
                 <AccessoryCard key={idx} {...item} />
              ))}
            </div>
            
            <Pagination currentPage={currentPage} totalPages={totalPages} baseUrl="/accessories" />
          </div>
      </div>

      <Footer />
    </main>
  )
}
