import { ArrowRight, Zap, ShieldCheck, BatteryCharging, MapPin } from 'lucide-react'
import { Header, MotionDiv } from '../components/header'
import { Button } from '../components/ui/button'
import { ProductCard } from '../components/product-card'
import { Footer } from '../components/footer'
import { auth0 } from '../lib/auth0'

export const dynamic = 'force-dynamic'

const products = [
    { name: 'VinFast VF8', desc: 'SUV cỡ trung mạnh mẽ, thiết kế đậm chất thể thao, trải nghiệm lái khác biệt.', price: '1.090.000.000', image: '/images/vf8.png' },
    { name: 'Vento S', desc: 'Xe máy điện cao cấp, vận hành êm ái, thiết kế thanh lịch chuẩn phong cách.', price: '50.000.000', image: '/images/vento.png' }
]

export default async function Home() {
    const session = await auth0.getSession()
    const user = session ? {
        email: session.user.email,
        name: session.user.name,
    } : undefined

    return (
      <main><Header user={user} />
        <section className="relative isolate flex min-h-[760px] h-[100svh] w-full items-center justify-center overflow-hidden bg-black text-center text-white">
          <img
            src="/images/maxresdefault.jpg"
            alt="Xe điện trên cung đường đô thị"
            className="absolute inset-0 -z-30 h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 -z-20 bg-black/25" />
          <div className="absolute inset-x-0 top-0 -z-10 h-56 bg-gradient-to-b from-black/55 via-black/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 -z-10 h-[46%] bg-gradient-to-t from-black via-black/55 to-transparent" />

          <div className="mx-auto flex h-full w-full max-w-[1920px] flex-col items-center px-5 pt-[22vh] sm:px-8 lg:px-16">
            <h1 className="hero-title-shadow max-w-[1800px] text-balance text-[clamp(3rem,6.2vw,7.5rem)] font-semibold leading-[0.98] tracking-[-0.055em] text-white lg:whitespace-nowrap">
              Khởi nguồn tương lai di chuyển
            </h1>
            <p className="hero-copy-shadow mt-8 max-w-5xl text-balance text-[clamp(1.15rem,2vw,2.35rem)] font-medium leading-[1.3] tracking-[-0.02em] text-white/95 sm:mt-10">
              Trải nghiệm giải pháp ô tô điện thông minh, đẳng cấp<br className="hidden md:block" /> toàn cầu.
            </p>
            <a
              href="#featured-vehicle"
              className="mt-12 inline-flex h-16 min-w-64 items-center justify-center rounded-full bg-white px-12 text-sm font-extrabold uppercase tracking-[0.16em] text-slate-950 shadow-[0_16px_45px_rgba(0,0,0,0.25)] transition hover:-translate-y-0.5 hover:bg-slate-100 sm:mt-16 sm:h-[72px] sm:min-w-80 sm:text-base"
            >
              Khám phá ngay
            </a>
          </div>

          <a href="#featured-vehicle" className="absolute bottom-7 left-1/2 flex -translate-x-1/2 flex-col items-center gap-4 text-white/65 transition hover:text-white" aria-label="Cuộn đến nội dung tiếp theo">
            <span className="text-[11px] font-bold uppercase tracking-[0.3em]">Cuộn để xem</span>
            <span className="scroll-line relative block h-20 w-px overflow-hidden bg-gradient-to-b from-white/90 via-white/45 to-transparent">
              <span className="scroll-line-pulse absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-transparent via-white to-transparent" />
            </span>
          </a>

          <p className="absolute inset-x-4 bottom-2 hidden text-center text-[10px] text-white/20 lg:block">
            Images and videos shown contain pre-production level vehicles. Actual production vehicles may differ slightly.
          </p>
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
                    <p className="text-3xl font-bold text-foreground tracking-tighter">680<span className="text-lg font-medium text-muted-foreground ml-1">km</span></p>
                    <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-[0.1em] font-bold">Phạm vi di chuyển</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-foreground tracking-tighter">6.5<span className="text-lg font-medium text-muted-foreground ml-1">s</span></p>
                    <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-[0.1em] font-bold">0-100 km/h</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-foreground tracking-tighter">AWD</p>
                    <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-[0.1em] font-bold">Dẫn động</p>
                  </div>
                </div>
                
                <div className="mt-12 flex flex-wrap gap-4">
                  <Button variant="default" className="bg-foreground text-background hover:bg-foreground/90 h-12 px-8 font-bold">Đặt cọc ngay</Button>
                  <Button variant="outline" className="h-12 px-8 border-muted-foreground/30 text-foreground hover:bg-muted font-bold">Thông số kỹ thuật</Button>
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
                <img src="/images/vf9.png" alt="VinFast VF9" className="relative z-10 w-full h-auto object-contain drop-shadow-2xl hover:scale-105 transition-transform duration-1000 ease-out" />
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
