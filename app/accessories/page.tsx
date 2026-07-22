import { AuthenticatedHeader } from '../../components/authenticated-header'
import { Footer } from '../../components/footer'
import { AccessoryCard } from '../../components/accessory-card'
import { Search, SlidersHorizontal, ChevronRight } from 'lucide-react'
import Link from 'next/link'

const categories = ["Tất cả", "Sạc & Cáp", "Nội thất", "Ngoại thất", "Đồ dã ngoại", "Quần áo thời trang"]

const accessories = [
  { name: 'Sạc di động loại nhỏ 2.2kW', price: '4.500.000', oldPrice: '5.000.000', discount: 10, image: '/images/vf8.png', rating: 4.8, stock: 15 },
  { name: 'Bộ thảm lót sàn cao cấp VF8', price: '2.100.000', oldPrice: null, discount: null, image: '/images/vf9.png', rating: 4.5, stock: 32 },
  { name: 'Bọc vô lăng da lộn thể thao', price: '850.000', oldPrice: '1.000.000', discount: 15, image: '/images/vento.png', rating: 4.9, stock: 5 },
  { name: 'Khay để đồ cốp xe chống nước', price: '1.200.000', oldPrice: null, discount: null, image: '/images/vf8.png', rating: 4.7, stock: 0 },
  { name: 'Sạc treo tường 7.4kW', price: '12.000.000', oldPrice: '15.000.000', discount: 20, image: '/images/vf9.png', rating: 5.0, stock: 8 },
  { name: 'Bạt phủ xe cao cấp', price: '1.500.000', oldPrice: null, discount: null, image: '/images/vento.png', rating: 4.2, stock: 45 },
  { name: 'Camera hành trình 4K', price: '3.800.000', oldPrice: '4.200.000', discount: 9, image: '/images/vf8.png', rating: 4.6, stock: 12 },
  { name: 'Bộ chia tẩu sạc thông minh', price: '450.000', oldPrice: null, discount: null, image: '/images/vf9.png', rating: 4.3, stock: 110 },
]

export default function AccessoriesPage() {
  return (
    <main className="flex min-h-screen flex-col bg-background pt-[74px]">
      <AuthenticatedHeader />
      
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
              <span className="text-sm text-muted-foreground font-medium hidden lg:inline">Hiển thị 8 kết quả</span>
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
        </div>
      </div>

      <Footer />
    </main>
  )
}
