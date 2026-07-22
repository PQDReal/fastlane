import { AuthenticatedHeader } from '../../components/authenticated-header'
import { Footer } from '../../components/footer'
import { PromoCard } from '../../components/promo-card'
import { ChevronRight } from 'lucide-react'
import Link from 'next/link'

const promotions = [
  { 
    title: 'Đặc quyền tiên phong VF9', 
    desc: 'Tặng gói phụ kiện cao cấp trị giá 50.000.000 VNĐ, miễn phí sạc pin 2 năm tại trạm sạc công cộng và voucher nghỉ dưỡng Vinpearl 7 ngày 6 đêm dành cho khách hàng đặt cọc sớm.', 
    type: 'Ô tô điện', 
    expires: '31/08/2026', 
    image: '/images/vf9.png', 
    cta: 'Nhận ưu đãi' 
  },
  { 
    title: 'Trả góp 0% lãi suất Vento S', 
    desc: 'Hỗ trợ trả góp 0% lãi suất trong 12 tháng qua thẻ tín dụng. Miễn phí phí cà thẻ và tặng kèm nón bảo hiểm chính hãng.', 
    type: 'Xe máy điện', 
    expires: '15/09/2026', 
    image: '/images/vento.png', 
    cta: 'Mua ngay' 
  },
  { 
    title: 'Giảm 20% phụ kiện nội thất', 
    desc: 'Chương trình tri ân khách hàng mua xe trong tháng 7. Giảm giá trực tiếp 20% cho tất cả phụ kiện nội thất khi mua kèm xe mới.', 
    type: 'Phụ kiện', 
    expires: '31/07/2026', 
    image: '/images/vf8.png', 
    cta: 'Khám phá' 
  },
]

export default function PromotionsPage() {
  return (
    <main className="flex min-h-screen flex-col bg-background pt-[74px]">
      <AuthenticatedHeader />
      
      <div className="relative overflow-hidden bg-foreground text-background py-32 lg:py-40">
        <div className="absolute inset-0 z-0 opacity-20">
           <img src="/images/maxresdefault.jpg" alt="Background" className="w-full h-full object-cover" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-foreground to-transparent z-10" />
        
        <div className="relative z-20 mx-auto max-w-[1440px] px-6 lg:px-12 text-center">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/50 mb-8">
            <Link href="/" className="hover:text-white transition-colors">Trang chủ</Link>
            <ChevronRight size={14} />
            <span className="text-white">Khuyến mãi</span>
          </div>
          <h1 className="text-5xl font-bold tracking-tight sm:text-7xl">Ưu đãi độc quyền</h1>
          <p className="mt-6 text-lg text-white/70 max-w-2xl mx-auto">
            Khám phá những đặc quyền vô tiền khoáng hậu chỉ dành riêng cho chủ nhân tương lai của Fastlane.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[1000px] px-6 lg:px-12 py-20 w-full -mt-16 relative z-30">
        <div className="flex flex-col gap-10">
          {promotions.map((promo, idx) => (
             <PromoCard key={idx} {...promo} />
          ))}
        </div>
      </div>

      <Footer />
    </main>
  )
}
