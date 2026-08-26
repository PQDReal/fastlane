import { ArrowRight, BatteryCharging, Leaf, MapPin, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { unstable_cache } from 'next/cache'
import { Header, MotionDiv } from '../components/header'
import { Button } from '../components/ui/button'
import { Footer } from '../components/footer'
import {
  HomeVehicleExperience,
  type HomeVehicle,
} from '../components/home-vehicle-experience'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { listMotorbikeCatalog } from '../lib/motorbike-catalog'
import { getCarSpecsSummary, getProductImage } from '../lib/get-product-image'

// Avoid Supabase connection failures on static prerendering.
// Page content relies on DB query at request time.
export const revalidate = 300

function shuffleItems<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5)
}

function productHref(product: any) {
  const categoryName = Array.isArray(product.category) ? product.category[0]?.name : product.category?.name
  if (categoryName === 'Xe máy điện' || product.product_type === 'BIKE') return `/bikes/${product.slug}`
  if (categoryName === 'Ô tô điện' || product.product_type === 'CAR') return `/cars/${product.slug}`
  return '#products'
}

function categoryName(product: any) {
  return Array.isArray(product.category) ? product.category[0]?.name : product.category?.name
}

function productType(product: any): 'CAR' | 'BIKE' | null {
  const category = categoryName(product)
  if (category === 'Xe máy điện' || product.product_type === 'BIKE') return 'BIKE'
  if (category === 'Ô tô điện' || product.product_type === 'CAR') return 'CAR'
  return null
}

function firstText(value: unknown, fallback: string) {
  if ((typeof value !== 'string' && typeof value !== 'number') || !String(value).trim()) return fallback
  return String(value).trim()
}

function parseAppView(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

function formatCarRange(value: unknown) {
  const text = firstText(value, 'Đang cập nhật')
  if (text === 'Đang cập nhật' || /\bkm\b/i.test(text)) return text
  const number = text.match(/\d+(?:[.,]\d+)?/)
  if (!number) return text
  return `${text.slice(0, number.index! + number[0].length)} km${text.slice(number.index! + number[0].length)}`
}

function formatCarPower(value: unknown) {
  const text = firstText(value, 'Đang cập nhật')
  if (text === 'Đang cập nhật' || /\bkw\b/i.test(text)) return text

  const horsepower = text.match(/\d+(?:[.,]\d+)?/)
  if (!horsepower) return text

  // Numeric maxPower values in the VinFast master specs are horsepower.
  const powerInKw = Math.round(Number(horsepower[0].replace(',', '.')) * 0.7457)
  return `${powerInKw} kW`
}

function colorHex(name: string) {
  const normalized = name.toLocaleLowerCase('vi-VN')
  if (normalized.includes('đỏ')) return '#c8172d'
  if (normalized.includes('xanh dương') || normalized.includes('xanh tím')) return '#345b9e'
  if (normalized.includes('xanh rêu') || normalized.includes('xanh oliu')) return '#71806a'
  if (normalized.includes('xanh')) return '#6f948b'
  if (normalized.includes('vàng') || normalized.includes('cát')) return '#c7aa65'
  if (normalized.includes('trắng')) return '#eeeDE8'
  if (normalized.includes('xám') || normalized.includes('ghi')) return '#85898a'
  if (normalized.includes('nâu')) return '#735443'
  if (normalized.includes('đen')) return '#202020'
  return '#b8b8b8'
}

async function loadHomeVehicles(): Promise<HomeVehicle[]> {
  try {
    const supabase = getSupabaseAdmin()
    const [carResult, motorbikeCatalog] = await Promise.all([
      supabase
        .from('products')
        .select(`
            id,
            name,
            slug,
            product_type,
            description,
            displayed_price,
            specifications,
            image_urls,
            category:categories(name)
          `)
        .eq('is_active', true)
        .in('product_type', ['CAR', 'VEHICLE'])
        .limit(48),
      listMotorbikeCatalog(),
    ])

    const rawProducts = [
      ...(carResult.data ?? []),
      ...motorbikeCatalog.map((motorbike) => ({
        id: motorbike.productId,
        name: motorbike.name,
        slug: motorbike.slug,
        product_type: 'BIKE',
        description: motorbike.description,
        displayed_price: motorbike.displayedPrice,
        specifications: motorbike.specifications,
        image_urls: [motorbike.listingImageUrl],
        colors: motorbike.colors.map((color) => color.name),
        category: { name: 'Xe máy điện' },
      })),
    ]

    const activeProducts = (rawProducts || []).filter(
      (product: any) => productType(product) && Number(product.displayed_price) > 0,
    )

    return activeProducts.map((product: any) => {
      const type = productType(product) as 'CAR' | 'BIKE'
      const productSpecifications = product.specifications || {}
      const richCarVariant = productSpecifications.specs
        ? (Object.values(productSpecifications.specs)[0] as any)
        : undefined
      const carSpecs = richCarVariant?.specs || {}
      const carAppView = parseAppView(carSpecs.appView)
      const range = firstText(
        type === 'CAR'
          ? formatCarRange(
            carAppView.range ||
            carSpecs.powertrain?.distance ||
            productSpecifications.range_text ||
            productSpecifications.range_km,
          )
          : productSpecifications['Quãng đường đi được mỗi lần sạc'],
        type === 'CAR' ? 'Đang cập nhật' : 'Đang cập nhật',
      )
      const power = firstText(
        type === 'CAR'
          ? formatCarPower(carAppView.maxPower || carSpecs.powertrain?.maxPower)
          : productSpecifications['Công suất tối đa'] || productSpecifications['Công suất danh định'],
        'Đang cập nhật',
      )
      const thirdMetric =
        type === 'CAR'
          ? firstText(carSpecs.powertrain?.drivetrain, 'Thuần điện')
          : firstText(productSpecifications['Tốc độ tối đa'], 'Đang cập nhật')
      const colorNames = type === 'BIKE' && Array.isArray(product.colors)
        ? product.colors
        : firstText(productSpecifications['Màu sắc'], '')
          .split(/[;,]/)
          .map((item) => item.trim())
          .filter(Boolean)

      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        type,
        description:
          getCarSpecsSummary(productSpecifications) ||
          product.description ||
          (type === 'BIKE'
            ? 'Linh hoạt trong phố, vận hành êm và không phát thải.'
            : 'Không gian hiện đại, công nghệ thông minh và trải nghiệm thuần điện.'),
        image: type === 'BIKE'
          ? product.image_urls[0]
          : getProductImage(product.name, product.image_urls),
        price: Number(product.displayed_price) || 0,
        range,
        power,
        thirdMetric,
        thirdMetricLabel: type === 'CAR' ? 'Dẫn động' : 'Tốc độ tối đa',
        colors: colorNames.map(colorHex),
        href: productHref(product),
        depositHref: `/deposit?type=${type === 'CAR' ? 'car' : 'motorbike'}&model=${encodeURIComponent(product.name)}`,
        estimatorHref: `/cost-estimator?model=${encodeURIComponent(product.name)}`,
        testDriveHref: `/test-drive?type=${type === 'CAR' ? 'car' : 'motorbike'}&model=${encodeURIComponent(product.name)}`,
      }
    })
  } catch (error) {
    if (process.env.npm_lifecycle_event === 'build' || !process.env.NODE_ENV || process.env.NODE_ENV !== 'production') {
      console.warn('⚠️  Home vehicles fetch failed during build. Returning empty list.', error)
      return []
    }
    throw error
  }
}

const getCachedHomeVehicles = unstable_cache(
  loadHomeVehicles,
  ['home-vehicle-catalog-v1'],
  { revalidate: 300, tags: ['vehicle-catalog', 'car-catalog', 'motorbike-catalog'] },
)

export default async function Home() {
  const homeVehicles = shuffleItems(await getCachedHomeVehicles())

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

      <HomeVehicleExperience vehicles={homeVehicles} />

      {/* GREEN FUTURE */}
      <section className="relative overflow-hidden bg-[#0d2119] text-white">
        <MotionDiv
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          className="pointer-events-none absolute inset-0 z-50 overflow-hidden"
        >
          <MotionDiv
            variants={{
              hidden: { x: '-100%' },
              visible: { x: '120vw', transition: { duration: 2, ease: 'easeInOut' } }
            }}
            className="absolute top-1/2 w-[350px] -translate-y-1/2 lg:w-[550px]"
          >
            <img src="https://res.cloudinary.com/dawbec7mw/image/upload/v1787712098/fastlane/products/404-car_1787712097071.png" alt="FastLane Car" className="h-auto w-full drop-shadow-[0_20px_30px_rgba(0,0,0,0.5)]" />
          </MotionDiv>
        </MotionDiv>

        <div className="relative mx-auto max-w-[1440px] px-6 py-24 lg:px-12 lg:py-32">
          <div
            aria-hidden="true"
            className="absolute -right-32 -top-40 h-[520px] w-[520px] rounded-full bg-[#84a98c]/20 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-48 left-[28%] h-[420px] w-[420px] rounded-full bg-[#a87908]/15 blur-3xl"
          />

          <MotionDiv
            initial={{ opacity: 0, filter: 'blur(8px)', y: 24 }}
            whileInView={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.8, delay: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="relative grid gap-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-end"
          >
            <div>
              <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-[#b8d3bd]">
                <Leaf size={15} strokeWidth={1.8} />
                Vì tương lai xanh
              </span>
              <h2 className="mt-6 max-w-4xl text-5xl font-bold leading-[0.98] tracking-[-0.05em] sm:text-6xl lg:text-7xl">
                Mỗi hành trình hôm nay,
                <span className="block text-[#b8d3bd]">một tương lai xanh hơn.</span>
              </h2>
              <p className="mt-7 max-w-2xl text-base leading-7 text-white/65 sm:text-lg sm:leading-8">
                FastLane đồng hành cùng mục tiêu di chuyển xanh của VinFast — đưa xe điện thông minh đến gần hơn với mọi người và góp phần kiến tạo một tương lai bền vững.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Button asChild className="h-12 rounded-full bg-white px-7 text-xs font-bold uppercase tracking-[0.12em] text-[#0d2119] hover:bg-white/90">
                  <a href="/cars">
                    Khám phá xe điện
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
                <Button asChild variant="outline" className="h-12 rounded-full border-white/25 bg-transparent px-7 text-xs font-bold uppercase tracking-[0.12em] text-white hover:bg-white/10 hover:text-white">
                  <a href="/bikes">Xe máy điện</a>
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {[
                {
                  icon: Zap,
                  title: 'Năng lượng sạch',
                  description: 'Vận hành thuần điện, hướng tới giảm phát thải.',
                },
                {
                  icon: Sparkles,
                  title: 'Công nghệ vì con người',
                  description: 'Thông minh, thuận tiện và dễ tiếp cận mỗi ngày.',
                },
                {
                  icon: Leaf,
                  title: 'Hành trình bền vững',
                  description: 'Lựa chọn hôm nay tạo nên thay đổi dài lâu.',
                },
              ].map((commitment) => (
                <div
                  key={commitment.title}
                  className="group flex gap-4 rounded-2xl border border-white/10 bg-white/[0.055] p-5 backdrop-blur-sm transition-colors hover:bg-white/[0.09]"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#b8d3bd] text-[#0d2119]">
                    <commitment.icon size={19} strokeWidth={1.7} />
                  </span>
                  <div>
                    <h3 className="font-bold tracking-tight">{commitment.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-white/55">{commitment.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </MotionDiv>
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
