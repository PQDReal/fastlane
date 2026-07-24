import { notFound } from 'next/navigation'
import { Header } from '../../../components/header'
import { Footer } from '../../../components/footer'
import { CarColorSelector } from '../../../components/car-color-selector'
import { getSupabaseAdmin } from '../../../lib/supabase-admin'
import { Button } from '../../../components/ui/button'
import { Check } from 'lucide-react'

export const dynamic = 'force-dynamic'

type TypedProductImage = {
  type: 'listing' | 'representative' | 'detail' | 'color'
  url: string
  position?: number
  name?: string
  swatch?: string
}

const isDisplayImage = (image: string) => {
  const normalized = image.toLowerCase()
  return (
    !normalized.endsWith('.mp4') &&
    !normalized.endsWith('.svg') &&
    !normalized.includes('logo') &&
    !normalized.includes('icon')
  )
}

const findSpec = (specs: Record<string, string>, keys: string[]) => {
  const entry = Object.entries(specs).find(
    ([key, value]) =>
      value.trim() !== '' &&
      keys.some((candidate) => key.toLowerCase().includes(candidate.toLowerCase())),
  )

  return entry?.[1] || 'N/A'
}

export default async function BikeDetailPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params
  const supabase = getSupabaseAdmin()

  const { data: product } = await supabase
    .from('products')
    .select('*')
    .eq('slug', params.slug)
    .eq('is_active', true)
    .single()

  if (!product) {
    notFound()
  }

  const specs: Record<string, string> =
    product.specifications &&
    typeof product.specifications === 'object' &&
    !Array.isArray(product.specifications)
      ? product.specifications
      : {}

  const typedImages: TypedProductImage[] = Array.isArray(product.image_urls)
    ? product.image_urls.filter(
        (item: unknown): item is TypedProductImage =>
          Boolean(
            item &&
              typeof item === 'object' &&
              'type' in item &&
              'url' in item &&
              typeof item.type === 'string' &&
              typeof item.url === 'string',
          ),
      )
    : []
  const bannerImg =
    typedImages.find((image) => image.type === 'representative')?.url || ''
  const detailImages = typedImages
    .filter((image) => image.type === 'detail')
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .map((image) => image.url)
    .slice(0, 3)
  while (detailImages.length < 3) detailImages.push('')
  const colorDetails = typedImages.filter(
    (image) => image.type === 'color' && image.name,
  )
  const bikeColors = colorDetails.map((color) => ({
    name: color.name || '',
    swatch: color.swatch || undefined,
  }))
  const colorImages = colorDetails.map((color) => color.url)
  const formatPrice = (price: number | null) =>
    typeof price === 'number' ? `${new Intl.NumberFormat('vi-VN').format(price)} ₫` : 'Liên hệ'

  const performanceSpecs = [
    {
      value: findSpec(specs, ['quãng đường']),
      label: 'Quãng đường',
    },
    {
      value: findSpec(specs, ['công suất tối đa', 'công suất lớn nhất']),
      label: 'Công suất tối đa',
    },
    {
      value: findSpec(specs, ['tốc độ tối đa']),
      label: 'Tốc độ tối đa',
    },
    {
      value: findSpec(specs, ['thời gian sạc']),
      label: 'Thời gian sạc',
    },
  ]

  const technologyFeatures = [
    findSpec(specs, ['loại động cơ']),
    findSpec(specs, ['loại pin', 'loại ắc quy']),
    findSpec(specs, ['dung lượng pin', 'dung lượng ắc quy']),
    findSpec(specs, ['khóa xe']),
  ].filter((value) => value !== 'N/A')

  const safetyFeatures = [
    findSpec(specs, ['phanh trước và sau']),
    findSpec(specs, ['giảm xóc']),
    findSpec(specs, ['chống nước']),
    'Khung xe chắc chắn, tối ưu cho vận hành đô thị',
  ].filter((value) => value !== 'N/A')

  const specEntries = Object.entries(specs).filter(
    ([, value]) => typeof value === 'string',
  )
  const midpoint = Math.ceil(specEntries.length / 2)
  const firstSpecColumn = specEntries.slice(0, midpoint)
  const secondSpecColumn = specEntries.slice(midpoint)

  return (
    <main className="flex min-h-screen flex-col bg-background selection:bg-brand-500 selection:text-white">
      <Header />

      {/* HERO SECTION */}
      <section className="relative h-screen min-h-[700px] w-full flex flex-col justify-between overflow-hidden bg-black">
        {bannerImg && (
          <img
            src={bannerImg}
            alt={product.name}
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/20 to-black/80" />

        <div className="relative z-10 flex flex-col items-center mt-32 sm:mt-40 text-center px-6 animate-fade-in-up" />

        <div
          className="relative z-10 flex flex-col items-center pb-12 w-full animate-fade-in-up"
          style={{ animationDelay: '0.3s' }}
        >
          <div className="flex gap-4 mb-12">
            <button className="h-12 sm:h-14 px-8 sm:px-12 rounded-full bg-white text-black font-bold uppercase tracking-widest text-sm sm:text-base hover:bg-white/90 transition-all hover:scale-105 active:scale-95 shadow-xl">
              Trải nghiệm
            </button>
            <button className="h-12 sm:h-14 px-8 sm:px-12 rounded-full bg-transparent border-2 border-white text-white font-bold uppercase tracking-widest text-sm sm:text-base hover:bg-white/10 transition-all hover:scale-105 active:scale-95 shadow-xl backdrop-blur-sm">
              Đặt cọc ngay
            </button>
          </div>

          <div className="flex flex-col items-center text-white/60 text-xs uppercase tracking-[0.2em] animate-bounce">
            <span className="mb-4">Khám phá</span>
            <div className="w-px h-12 bg-gradient-to-b from-white/60 to-transparent" />
          </div>
        </div>
      </section>

      {/* STICKY NAV CTA */}
      <div className="sticky top-[74px] z-40 bg-background/80 backdrop-blur-md border-b border-white/10 shadow-sm">
        <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center">
            <h2 className="font-bold text-lg hidden sm:block">{product.name}</h2>
          </div>
          <div className="flex gap-6 text-sm font-semibold text-muted-foreground">
            <a href="#design" className="hover:text-foreground transition-colors">Thiết kế</a>
            <a href="#performance" className="hover:text-foreground transition-colors">Vận hành</a>
            <a href="#specs" className="hover:text-foreground transition-colors">Thông số</a>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-bold hidden md:block mr-2">{formatPrice(product.displayed_price)}</span>
            <Button size="sm" variant="outline" className="rounded-full font-bold border-brand-600 text-brand-600 hover:bg-brand-50 hidden sm:inline-flex">
              Dự toán
            </Button>
            <Button size="sm" className="rounded-full bg-brand-600 hover:bg-brand-700 text-white font-bold">
              Đặt cọc
            </Button>
          </div>
        </div>
      </div>

      {/* HIGHLIGHTS SECTION */}
      <section id="performance" className="py-24 bg-muted">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 text-center divide-x divide-black/5">
            {performanceSpecs.map((item) => (
              <div key={item.label} className="flex flex-col items-center px-3">
                <p className="text-xl md:text-2xl font-bold tracking-tight mb-2">{item.value}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COLOR SELECTOR */}
      <CarColorSelector colors={bikeColors} images={colorImages} />

      {/* DESIGN SECTION */}
      <section id="design" className="py-32 bg-background">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-12">
          <div className="mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">Thiết kế hiện đại</h2>
            <p className="text-xl text-muted-foreground max-w-2xl">
              {product.description || `${product.name} mang thiết kế trẻ trung, linh hoạt và phù hợp với nhịp sống đô thị.`}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-16">
            {detailImages[0] && (
              <div className="md:col-span-2 overflow-hidden rounded-[2rem]">
                <img src={detailImages[0]} alt={`Thiết kế ${product.name}`} className="w-full h-auto object-cover hover:scale-105 transition-transform duration-1000" />
              </div>
            )}
            {detailImages[1] && (
              <div className="overflow-hidden rounded-[2rem] aspect-square">
                <img src={detailImages[1]} alt={`Chi tiết ${product.name}`} className="w-full h-full object-cover hover:scale-105 transition-transform duration-1000" />
              </div>
            )}
            {detailImages[2] && (
              <div className="overflow-hidden rounded-[2rem] aspect-square relative group">
                <img src={detailImages[2]} alt={`Phong cách ${product.name}`} className="w-full h-full object-cover hover:scale-105 transition-transform duration-1000" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-8 text-white">
                  <h3 className="text-2xl font-bold mb-2">Phong cách khác biệt</h3>
                  <p className="text-white/80">Từng đường nét được tối ưu cho trải nghiệm di chuyển hằng ngày.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* TECHNOLOGY & SAFETY SECTION */}
      <section className="py-32 bg-muted">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-12 grid grid-cols-1 lg:grid-cols-2 gap-16">
          <div>
            <h2 className="text-4xl font-bold tracking-tight mb-6">Công nghệ thông minh</h2>
            <p className="text-lg text-muted-foreground mb-12">
              Hệ truyền động điện hiệu quả, vận hành êm ái và thuận tiện cho nhu cầu di chuyển đô thị.
            </p>
            <div className="grid grid-cols-2 gap-6">
              {technologyFeatures.map((feature) => (
                <div key={feature} className="bg-white p-6 rounded-2xl shadow-sm border border-black/5 hover:shadow-md transition-shadow">
                  <Check className="text-brand-500 mb-4" size={24} />
                  <h4 className="font-bold text-slate-900">{feature}</h4>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-4xl font-bold tracking-tight mb-6">An toàn trên mọi hành trình</h2>
            <p className="text-lg text-muted-foreground mb-12">
              Các trang bị vận hành và bảo vệ được thiết kế để mang lại sự tự tin trên từng cung đường.
            </p>
            <div className="grid grid-cols-2 gap-6">
              {safetyFeatures.map((feature) => (
                <div key={feature} className="bg-black text-white p-6 rounded-2xl shadow-sm hover:bg-black/90 transition-colors">
                  <Check className="text-white mb-4" size={24} />
                  <h4 className="font-bold">{feature}</h4>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FULL SPECS SECTION */}
      <section id="specs" className="py-32 bg-white text-foreground">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-12">
          <h2 className="text-4xl font-bold tracking-tight mb-16">Thông số kỹ thuật {product.name}</h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
            <div>
              <h3 className="text-2xl font-bold border-b border-black/10 pb-4 mb-6">Động cơ &amp; Vận hành</h3>
              <ul className="space-y-4">
                {firstSpecColumn.map(([key, value]) => (
                  <li key={key} className="flex justify-between gap-6 py-2 border-b border-black/5 text-sm">
                    <span className="text-muted-foreground">{key}</span>
                    <span className="font-semibold text-right max-w-[50%]">{value}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-2xl font-bold border-b border-black/10 pb-4 mb-6">Kích thước &amp; Trang bị</h3>
              <ul className="space-y-4">
                {secondSpecColumn.map(([key, value]) => (
                  <li key={key} className="flex justify-between gap-6 py-2 border-b border-black/5 text-sm">
                    <span className="text-muted-foreground">{key}</span>
                    <span className="font-semibold text-right max-w-[50%]">{value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-16 flex justify-center">
            <Button variant="outline" className="rounded-full px-8 border-black text-black hover:bg-black/5 font-bold">
              Xem thông số chi tiết
            </Button>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-32 bg-[#171411] text-white text-center">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-4xl sm:text-6xl font-bold tracking-tight mb-8">Sẵn sàng trải nghiệm?</h2>
          <p className="text-xl text-white/70 mb-12">Gia nhập cộng đồng người dùng xe điện toàn cầu cùng VinFast.</p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Button variant="default" className="bg-white text-black hover:bg-white/90 h-14 px-10 rounded-full font-bold uppercase tracking-wider text-sm transition-transform hover:scale-105">
              Đặt cọc ngay
            </Button>
            <Button variant="outline" className="h-14 px-10 rounded-full border-white/20 text-white hover:bg-white/10 font-bold uppercase tracking-wider text-sm">
              Đăng ký lái thử
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
