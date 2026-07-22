import { Header } from '../../components/header'
import { Footer } from '../../components/footer'
import { ChevronRight, Plus, X } from 'lucide-react'
import Link from 'next/link'
import { Button } from '../../components/ui/button'

const vehicles = [
  {
    id: 'vf9',
    name: 'VinFast VF9',
    image: '/images/vf9.png',
    price: '1.491.000.000 ₫',
    specs: {
      battery: '123 kWh',
      range: '680 km',
      power: '402 hp',
      acceleration: '6.5 s',
      charge: '26 phút (10-70%)',
      seats: '7',
      dimensions: '5.118 x 2.254 x 1.696',
      warranty: '10 năm / 200.000 km',
      safety: '11 túi khí, ADAS Level 2'
    }
  },
  {
    id: 'vf8',
    name: 'VinFast VF8',
    image: '/images/vf8.png',
    price: '1.090.000.000 ₫',
    specs: {
      battery: '87.7 kWh',
      range: '471 km',
      power: '349 hp',
      acceleration: '5.5 s',
      charge: '24 phút (10-70%)',
      seats: '5',
      dimensions: '4.750 x 1.934 x 1.667',
      warranty: '10 năm / 200.000 km',
      safety: '11 túi khí, ADAS Level 2'
    }
  },
]

const specKeys = [
  { key: 'battery', label: 'Dung lượng Pin' },
  { key: 'range', label: 'Quãng đường (WLTP)' },
  { key: 'power', label: 'Công suất tối đa' },
  { key: 'acceleration', label: 'Tăng tốc 0-100 km/h' },
  { key: 'charge', label: 'Sạc nhanh' },
  { key: 'seats', label: 'Số chỗ ngồi' },
  { key: 'dimensions', label: 'Kích thước (D x R x C)' },
  { key: 'warranty', label: 'Bảo hành' },
  { key: 'safety', label: 'An toàn' },
]

export default function ComparePage() {
  return (
    <main className="flex min-h-screen flex-col bg-background pt-[74px]">
      <Header />
      
      <div className="bg-muted py-16 border-b border-black/5">
        <div className="mx-auto max-w-[1440px] px-6 lg:px-12 text-center">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-6">
            <Link href="/" className="hover:text-brand-600 transition-colors">Trang chủ</Link>
            <ChevronRight size={14} />
            <span className="text-foreground">So sánh xe</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-6xl">So sánh thông số</h1>
        </div>
      </div>

      <div className="mx-auto max-w-[1440px] px-6 lg:px-12 py-16 w-full">
        <div className="overflow-x-auto pb-8">
          <div className="min-w-[800px]">
            {/* Header Row */}
            <div className="grid grid-cols-4 gap-6 mb-12">
              <div className="flex flex-col justify-end">
                <h3 className="text-2xl font-bold text-foreground">Tổng quan</h3>
                <p className="text-sm text-muted-foreground mt-2">So sánh chi tiết các mẫu xe để tìm ra lựa chọn hoàn hảo nhất cho bạn.</p>
              </div>
              
              {vehicles.map((v) => (
                <div key={v.id} className="relative bg-muted/30 rounded-2xl p-6 text-center border border-transparent hover:border-black/5 transition-colors group">
                  <button className="absolute top-4 right-4 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"><X size={16}/></button>
                  <img src={v.image} alt={v.name} className="h-32 w-auto object-contain mx-auto mb-6" />
                  <h4 className="text-xl font-bold text-foreground">{v.name}</h4>
                  <p className="text-brand-600 font-bold mt-2">{v.price}</p>
                </div>
              ))}
              
              <div className="border-2 border-dashed border-muted rounded-2xl flex flex-col items-center justify-center p-6 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors cursor-pointer min-h-[250px]">
                <div className="w-12 h-12 rounded-full bg-background border border-muted flex items-center justify-center mb-4">
                  <Plus size={24} />
                </div>
                <span className="font-bold">Thêm mẫu xe</span>
              </div>
            </div>

            {/* Specs Rows */}
            <div className="space-y-0 border-t border-muted">
              {specKeys.map((spec, index) => (
                <div key={spec.key} className={`grid grid-cols-4 gap-6 py-6 border-b border-muted items-center ${index % 2 === 0 ? 'bg-transparent' : 'bg-muted/20'}`}>
                  <div className="text-sm font-bold text-foreground pl-4 uppercase tracking-wider">{spec.label}</div>
                  
                  {vehicles.map((v) => (
                    <div key={v.id} className="text-center text-sm font-medium text-foreground">
                      {(v.specs as any)[spec.key]}
                    </div>
                  ))}
                  
                  <div className="text-center text-sm text-muted-foreground">-</div>
                </div>
              ))}
            </div>

            {/* CTA Row */}
            <div className="grid grid-cols-4 gap-6 mt-12">
              <div></div>
              {vehicles.map((v) => (
                <div key={v.id} className="px-6">
                  <Button className="w-full bg-foreground text-background font-bold h-12">Đặt cọc ngay</Button>
                </div>
              ))}
              <div></div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  )
}
