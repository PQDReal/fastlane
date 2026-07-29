import { ArrowRight, Zap, ShieldCheck, BatteryCharging, MapPin } from 'lucide-react'
import { Header, MotionDiv } from '../components/header'
import { Button } from '../components/ui/button'
import { ProductCard } from '../components/product-card'
import { Footer } from '../components/footer'
import { auth0 } from '../lib/auth0'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const session = await auth0.getSession()
  const user = session ? {
    email: session.user.email,
    name: session.user.name,
  } : undefined

  const supabase = getSupabaseAdmin()
  const { data: rawProducts } = await supabase
    .from('products')
    .select(`
        *,
        category:categories(name)
      `)
    .eq('is_active', true)
    .limit(2) // Get two products for the homepage section

  const fs = require('fs')
  const path = require('path')
  let vf9Specs: any = {}
  try {
    const specsRaw = fs.readFileSync(path.join(process.cwd(), 'public', 'data', 'master_car_specs.json'), 'utf8')
    const specsData = JSON.parse(specsRaw)
    vf9Specs = specsData['VF 9']?.variants?.['Plus tùy chọn 7 chỗ']?.specs || {}
  } catch (e) {
    console.error('Failed to load VF9 specs', e)
  }

  const distanceStr = vf9Specs.powertrain?.distance || '602'
  const distance = distanceStr.match(/\d+/)?.[0] || '602'

  const maxPowerStr = vf9Specs.powertrain?.maxPower || '402'
  const maxPower = maxPowerStr.match(/\d+/)?.[0] || '402'

  const drivetrainStr = vf9Specs.powertrain?.drivetrain || 'AWD'
  const drivetrain = drivetrainStr.includes('AWD') ? 'AWD' : drivetrainStr.split('/')[0]

  const { getProductImage, getCarSpecsSummary } = require('../lib/get-product-image')
  const vf9Image = getProductImage('VF 9')

  const sortedProducts = (rawProducts || []).sort((a, b) => {
    const numA = parseInt(a.name.match(/\d+/)?.[0] || '0', 10)
    const numB = parseInt(b.name.match(/\d+/)?.[0] || '0', 10)
    if (numA !== numB) return numA - numB
    return a.name.localeCompare(b.name)
  })

  const products = sortedProducts.map(p => {
    const image = getProductImage(p.name, p.image_urls)
    const specsSummary = getCarSpecsSummary(p.name)
    return {
      name: p.name.toUpperCase().startsWith('VINFAST') ? p.name.toUpperCase() : `VINFAST ${p.name.toUpperCase()}`,
      desc: specsSummary || p.description || 'Xe ô tô điện VinFast',
      price: new Intl.NumberFormat('vi-VN').format(p.displayed_price),
      image,
      href: `/cars/${p.slug}`
    }
  })

  return (
    <main><Header />
      <section className="home-hero relative flex min-h-[720px] items-center justify-center overflow-hidden bg-[#171411] text-center">
        <img src="/images/maxresdefault.jpg" alt="Xe điện trên cung đường đô thị" className="absolute inset-0 h-full w-full object-cover object-center" />
        <div className="home-hero-overlay absolute inset-0" />
        <div className="relative z-10 mx-auto flex w-full max-w-[1680px] flex-col items-center px-5 pb-10 pt-28 sm:px-8 lg:pb-20 lg:pt-32">
          <h1 className="hero-sunlight hero-title-shadow text-[44px] font-bold leading-[1.04] tracking-[-0.045em] sm:text-[64px] lg:text-[clamp(72px,6.15vw,112px)]">
            <span className="hero-copy">
              <span>Khởi nguồn</span>
              <span>Tương lai di chuyển.</span>
            </span>
            <span className="hero-light" aria-hidden="true">
              <span>Khởi nguồn</span>
              <span>Tương lai di chuyển.</span>
            </span>
          </h1>
          <div className="mt-7 sm:mt-9 lg:mt-10">
            <p className="mx-auto max-w-[920px] text-lg font-medium leading-snug text-white/90 sm:text-2xl lg:text-[32px] lg:leading-[1.3]">Trải nghiệm giải pháp ô tô điện thông minh, đẳng cấp<br className="hidden sm:block" /> toàn cầu.</p>
            <div className="mt-8 flex justify-center sm:mt-10">
              <Button asChild variant="outline" className="h-14 rounded-full border-0 bg-white px-10 text-[13px] font-bold uppercase tracking-[0.14em] text-slate-950 shadow-none hover:bg-white/90 sm:h-[72px] sm:px-16 sm:text-base">
                <a href="#featured-vehicle">Khám phá ngay</a>
              </Button>
            </div>
          </div>
        </div>
        <a href="#featured-vehicle" className="absolute bottom-0 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center text-white/65 transition-colors hover:text-white" aria-label="Cuộn để xem">
          <span className="mb-7 text-[10px] font-bold uppercase tracking-[0.3em] sm:text-xs">Cuộn để xem</span>
          <span className="scroll-line relative h-10 w-px overflow-hidden bg-white/35 sm:h-16"><span className="scroll-line-pulse absolute left-0 top-0 h-8 w-px bg-white" /></span>
        </a>
      </section>

      {/* FEATURED VEHICLE (VF9) */}
      <section id="featured-vehicle" className="relative z-10 w-full scroll-mt-20 bg-background py-32 lg:py-48">
        <div className="mx-auto max-w-[1440px] px-6 lg:px-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
            <MotionDiv
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-200px' }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="text-brand-600 font-bold uppercase tracking-widest text-xs">Flagship SUV</span>
              <h2 className="mt-4 text-5xl font-bold tracking-tighter text-foreground sm:text-7xl">VinFast VF9</h2>
              <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-lg">
                Tuyệt tác công nghệ và nghệ thuật thiết kế. Không gian rộng rãi hạng thương gia, tích hợp các công nghệ thông minh bậc nhất, sẵn sàng đồng hành cùng bạn trên mọi hành trình vĩ đại.
              </p>

              <div className="mt-12 grid grid-cols-3 gap-8 border-t border-muted pt-8">
                <div>
                  <p className="text-3xl font-bold text-foreground tracking-tighter">{distance}<span className="text-lg font-medium text-muted-foreground ml-1">km</span></p>
                  <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-[0.1em] font-bold">Phạm vi di chuyển</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-foreground tracking-tighter">{maxPower}<span className="text-lg font-medium text-muted-foreground ml-1">hp</span></p>
                  <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-[0.1em] font-bold">Công suất tối đa</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-foreground tracking-tighter">{drivetrain}</p>
                  <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-[0.1em] font-bold">Dẫn động</p>
                </div>
              </div>

              <div className="mt-12 flex flex-wrap gap-4">
                <Button asChild variant="default" className="bg-foreground text-background hover:bg-foreground/90 h-12 px-8 font-bold relative z-20">
                  <Link href="/deposit?type=car&model=VF%209">Đặt cọc ngay</Link>
                </Button>
                <Button asChild variant="outline" className="h-12 px-8 border-muted-foreground/30 text-foreground hover:bg-muted font-bold relative z-20">
                  <Link href="/cars/vf-9">Thông số kỹ thuật</Link>
                </Button>
              </div>
            </MotionDiv>

            <MotionDiv
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: '-200px' }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              className="relative h-[400px] sm:h-[500px] lg:h-[600px] w-full rounded-[2rem] overflow-hidden bg-muted flex items-center justify-center p-8"
            >
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white via-muted to-muted opacity-50" />
              <img src={vf9Image} alt="VinFast VF9" className="relative z-10 w-full h-auto object-contain drop-shadow-2xl hover:scale-105 transition-transform duration-1000 ease-out" />
            </MotionDiv>
          </div>
        </div>
      </section>

      {/* VEHICLE COLLECTION */}
      <section className="bg-muted py-32 lg:py-48">
        <div className="mx-auto max-w-[1440px] px-6 lg:px-12">
          <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.8 }}
            className="flex flex-col md:flex-row md:items-end justify-between gap-6"
          >
            <div>
              <h2 className="text-4xl font-bold tracking-tight text-foreground sm:text-6xl">Bộ sưu tập</h2>
              <p className="mt-4 text-lg text-muted-foreground max-w-md">Những thiết kế được yêu thích nhất, mang đậm ngôn ngữ thiết kế tương lai.</p>
            </div>
            <a className="group flex items-center text-[13px] font-bold uppercase tracking-widest text-brand-600 hover:text-brand-700 transition-colors" href="#products">
              Xem tất cả <ArrowRight className="ml-3 transition-transform group-hover:translate-x-1" size={18} />
            </a>
          </MotionDiv>

          <div id="products" className="mt-20 grid gap-12 md:grid-cols-2">
            {products.map((p, i) => (
              <MotionDiv
                key={p.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-100px' }}
                transition={{ duration: 1, delay: i * 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                <ProductCard {...p} />
              </MotionDiv>
            ))}
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section className="py-32 lg:py-48 bg-background">
        <div className="mx-auto max-w-[1440px] px-6 lg:px-12">
          <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.8 }}
            className="text-center max-w-2xl mx-auto"
          >
            <h2 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">Dịch vụ đặc quyền</h2>
            <p className="mt-6 text-lg text-muted-foreground">Trải nghiệm sở hữu xe điện liền mạch, từ lúc bắt đầu tìm hiểu cho đến mọi hành trình sau này.</p>
          </MotionDiv>

          <div className="mt-24 grid sm:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-16">
            {[
              { icon: Zap, title: "Sạc siêu tốc", desc: "Mạng lưới trạm sạc phủ khắp toàn quốc, an tâm di chuyển." },
              { icon: ShieldCheck, title: "Bảo hành 10 năm", desc: "Chính sách bảo hành vượt trội, khẳng định chất lượng toàn cầu." },
              { icon: BatteryCharging, title: "Thuê pin linh hoạt", desc: "Tiết kiệm chi phí ban đầu, an tâm tuyệt đối về chất lượng pin." },
              { icon: MapPin, title: "Lái thử tận nhà", desc: "Trải nghiệm xe thật tại nhà, tiết kiệm thời gian tối đa." }
            ].map((service, i) => (
              <MotionDiv
                key={service.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.8, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-col items-center text-center group cursor-pointer"
              >
                <div className="h-20 w-20 rounded-2xl bg-muted flex items-center justify-center text-foreground group-hover:bg-foreground group-hover:text-background transition-colors duration-500">
                  <service.icon size={28} strokeWidth={1.5} />
                </div>
                <h3 className="mt-8 text-xl font-bold text-foreground tracking-tight">{service.title}</h3>
                <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-[250px]">{service.desc}</p>
              </MotionDiv>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
