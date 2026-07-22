'use client'

import { ArrowRight, Zap, ShieldCheck, BatteryCharging, MapPin } from 'lucide-react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'
import { Header } from '../components/header'
import { Button } from '../components/ui/button'
import { ProductCard } from '../components/product-card'
import { Footer } from '../components/footer'

const products = [
    { name: 'VinFast VF8', desc: 'SUV cỡ trung mạnh mẽ, thiết kế đậm chất thể thao, trải nghiệm lái khác biệt.', price: '1.090.000.000', image: '/images/vf8.png' },
    { name: 'Vento S', desc: 'Xe máy điện cao cấp, vận hành êm ái, thiết kế thanh lịch chuẩn phong cách.', price: '50.000.000', image: '/images/vento.png' }
]

export default function Home() {
    const heroRef = useRef(null)
    const { scrollYProgress } = useScroll({
      target: heroRef,
      offset: ["start start", "end start"]
    })
    const y = useTransform(scrollYProgress, [0, 1], ["0%", "50%"])
    const opacity = useTransform(scrollYProgress, [0, 1], [1, 0])

    return (
      <main className="flex min-h-screen flex-col bg-background">
        <Header />
        
        {/* HERO SECTION */}
        <section ref={heroRef} className="relative flex h-screen min-h-[800px] w-full items-center justify-center overflow-hidden bg-black text-center">
            <motion.div style={{ y, opacity }} className="absolute inset-0 h-full w-full">
              <img 
                src="/images/maxresdefault.jpg" 
                alt="Xe điện trên cung đường đô thị" 
                className="h-full w-full object-cover object-center opacity-70" 
              />
              <div className="absolute inset-0 bg-hero-gradient" />
            </motion.div>
            
            <div className="relative z-10 mx-auto flex h-full w-full max-w-[1440px] flex-col items-center justify-start px-6 pt-48 pb-32">
                <motion.h1 
                  initial={{ y: 40, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                  className="text-5xl font-bold leading-[1.1] tracking-tight text-white sm:text-6xl lg:text-7xl drop-shadow-2xl"
                >
                  Khởi nguồn tương lai di chuyển
                </motion.h1>
                <motion.p 
                  initial={{ y: 30, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 1.2, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="mt-6 max-w-2xl text-lg font-medium text-white/90 sm:text-2xl tracking-wide drop-shadow-lg"
                >
                  Trải nghiệm giải pháp ô tô điện thông minh, đẳng cấp toàn cầu.
                </motion.p>
                
                <motion.div 
                  initial={{ y: 30, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 1.2, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="mt-12"
                >
                  <Button variant="default" size="default" className="h-12 px-10 text-[13px] tracking-widest uppercase bg-white text-black hover:bg-white/90 font-bold rounded-full">
                    Khám phá ngay
                  </Button>
                </motion.div>
            </div>
            
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5, duration: 2 }}
              className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center"
            >
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/50 mb-4 font-bold">Cuộn để xem</span>
              <div className="h-16 w-[1px] bg-white/20 relative overflow-hidden">
                <motion.div 
                  animate={{ y: ['-100%', '100%'] }} 
                  transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                  className="absolute inset-0 h-full w-full bg-white" 
                />
              </div>
            </motion.div>
        </section>

        {/* FEATURED VEHICLE (VF9) */}
        <section className="relative w-full bg-background py-32 lg:py-48 z-10">
          <div className="mx-auto max-w-[1440px] px-6 lg:px-12">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
              <motion.div 
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
              </motion.div>
              
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, margin: '-200px' }}
                transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                className="relative h-[400px] sm:h-[500px] lg:h-[600px] w-full rounded-[2rem] overflow-hidden bg-muted flex items-center justify-center p-8"
              >
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white via-muted to-muted opacity-50" />
                <img src="/images/vf9.png" alt="VinFast VF9" className="relative z-10 w-full h-auto object-contain drop-shadow-2xl hover:scale-105 transition-transform duration-1000 ease-out" />
              </motion.div>
            </div>
          </div>
        </section>

        {/* VEHICLE COLLECTION */}
        <section className="bg-muted py-32 lg:py-48">
          <div className="mx-auto max-w-[1440px] px-6 lg:px-12">
            <motion.div 
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
            </motion.div>
            
            <div id="products" className="mt-20 grid gap-12 md:grid-cols-2">
              {products.map((p, i) => (
                <motion.div 
                  key={p.name}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-100px' }}
                  transition={{ duration: 1, delay: i * 0.2, ease: [0.16, 1, 0.3, 1] }}
                >
                  <ProductCard {...p} />
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* SERVICES */}
        <section className="py-32 lg:py-48 bg-background">
          <div className="mx-auto max-w-[1440px] px-6 lg:px-12">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.8 }}
              className="text-center max-w-2xl mx-auto"
            >
              <h2 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">Dịch vụ đặc quyền</h2>
              <p className="mt-6 text-lg text-muted-foreground">Trải nghiệm sở hữu xe điện liền mạch, từ lúc bắt đầu tìm hiểu cho đến mọi hành trình sau này.</p>
            </motion.div>

            <div className="mt-24 grid sm:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-16">
              {[
                { icon: Zap, title: "Sạc siêu tốc", desc: "Mạng lưới trạm sạc phủ khắp toàn quốc, an tâm di chuyển." },
                { icon: ShieldCheck, title: "Bảo hành 10 năm", desc: "Chính sách bảo hành vượt trội, khẳng định chất lượng toàn cầu." },
                { icon: BatteryCharging, title: "Thuê pin linh hoạt", desc: "Tiết kiệm chi phí ban đầu, an tâm tuyệt đối về chất lượng pin." },
                { icon: MapPin, title: "Lái thử tận nhà", desc: "Trải nghiệm xe thật tại nhà, tiết kiệm thời gian tối đa." }
              ].map((service, i) => (
                <motion.div 
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
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <Footer />
      </main>
    )
}
