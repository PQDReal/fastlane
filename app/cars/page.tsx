import { AuthenticatedHeader } from '../../components/authenticated-header'
import { Footer } from '../../components/footer'
import { VehicleCard } from '../../components/vehicle-card'
import { Search, SlidersHorizontal, ChevronRight } from 'lucide-react'
import Link from 'next/link'

const cars = [
  { name: 'VinFast VF9', desc: 'Flagship SUV cỡ lớn, thiết kế bề thế, đẳng cấp thương gia.', price: '1.491.000.000', image: '/images/vf9.png', range: '680', battery: '123', horsepower: '402', seats: '7' },
  { name: 'VinFast VF8', desc: 'SUV cỡ trung mạnh mẽ, thiết kế đậm chất thể thao.', price: '1.090.000.000', image: '/images/vf8.png', range: '471', battery: '87.7', horsepower: '349', seats: '5' },
  { name: 'VinFast VF7', desc: 'SUV hạng C cá tính, phong cách thiết kế phi thuyền vũ trụ.', price: '850.000.000', image: '/images/vf8.png', range: '431', battery: '59.6', horsepower: '174', seats: '5' },
]

export default function CarsPage() {
  return (
    <main className="flex min-h-screen flex-col bg-background pt-[74px]">
      <AuthenticatedHeader />
      
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
            Hiển thị {cars.length} dòng xe
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {cars.map((car, idx) => (
             <VehicleCard key={idx} {...car} />
          ))}
        </div>
      </div>

      <Footer />
    </main>
  )
}
