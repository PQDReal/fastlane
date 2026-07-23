import { notFound } from 'next/navigation'
import { Header } from '../../../components/header'
import { Footer } from '../../../components/footer'
import { CarColorSelector } from '../../../components/car-color-selector'
import { getSupabaseAdmin } from '../../../lib/supabase-admin'
import fs from 'fs'
import path from 'path'
import { Button } from '../../../components/ui/button'
import { Check, ChevronRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function CarDetailPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params
  const supabase = getSupabaseAdmin()
  
  const { data: product } = await supabase
    .from('products')
    .select(`*`)
    .eq('slug', params.slug)
    .single()

  if (!product) {
    notFound()
  }

  // Load JSON data
  const carsDataPath = path.join(process.cwd(), 'public', 'data', 'by_type', 'cars.json')
  const specsDataPath = path.join(process.cwd(), 'public', 'data', 'master_car_specs.json')
  
  const carsData = JSON.parse(fs.readFileSync(carsDataPath, 'utf8'))
  const specsData = JSON.parse(fs.readFileSync(specsDataPath, 'utf8'))
  
  const landingDataPath = path.join(process.cwd(), 'public', 'data', 'car-landing-content.json')
  const landingData = fs.existsSync(landingDataPath) ? JSON.parse(fs.readFileSync(landingDataPath, 'utf8')) : {}

  // Find matching car data
  let carRichData = carsData.find((c: any) => product.name.includes(c.name) || c.name.includes(product.name))
  if (!carRichData) carRichData = carsData[0] 
  
  let carSpecs = specsData[carRichData.name]
  if (!carSpecs) carSpecs = specsData['VF 8'] 

  const formatPrice = (price: number) => new Intl.NumberFormat('vi-VN').format(price) + ' ₫'

  const exteriorImgs = carRichData.gallery?.exterior_images || []
  const interiorImgs = carRichData.gallery?.interior_images || []

  let bannerImg = carRichData.gallery?.banner_images?.find((img: string) => !img.includes('mobile') && !img.includes('_mb')) 
    || carRichData.gallery?.banner_images?.[0] 
    || product.image_urls?.[0] 
    || '/images/vf8.png'

  if (product.name === 'VF 3') {
    bannerImg = carRichData.gallery?.exterior_images?.[1] || bannerImg
  }

  const logoImg = [...exteriorImgs, ...interiorImgs, ...(carRichData.gallery?.all_images || [])].find((img: string) => img.toLowerCase().includes('logo') || img.toLowerCase().endsWith('.svg'))
  
  const validExteriorImgs = exteriorImgs.filter((img: string) => !img.toLowerCase().includes('logo') && !img.toLowerCase().endsWith('.mp4') && !img.toLowerCase().endsWith('.svg') && !img.toLowerCase().includes('banner') && !img.toLowerCase().includes('tvc') && !img.includes('vf3.jpg'))
  const validInteriorImgs = interiorImgs.filter((img: string) => !img.toLowerCase().includes('logo') && !img.toLowerCase().endsWith('.mp4') && !img.toLowerCase().endsWith('.svg') && !img.toLowerCase().includes('banner') && !img.toLowerCase().includes('tvc'))

  // Sometimes all images are in 'all_images' and exterior/interior is empty
  const fallbackImgs = (carRichData.gallery?.all_images || []).filter((img: string) => !img.toLowerCase().includes('logo') && !img.toLowerCase().endsWith('.mp4') && !img.toLowerCase().endsWith('.svg') && !img.toLowerCase().includes('banner') && !img.toLowerCase().includes('tvc'))
  
  const displayImgs = validExteriorImgs.length > 0 ? validExteriorImgs : fallbackImgs
  const displayIntImgs = validInteriorImgs.length > 0 ? validInteriorImgs : fallbackImgs.slice(3)

  const variantKeys = Object.keys(carSpecs.variants || {})
  const firstVariant = variantKeys.length > 0 ? carSpecs.variants[variantKeys[0]] : null
  const specs = firstVariant?.specs || {}

  // Extract images that look like colored variants
  const carColors = carRichData.colors || []
  let colorImages = carColors.map((c: any) => typeof c === 'object' && c.image ? c.image : null).filter(Boolean)
  if (colorImages.length === 0) {
    colorImages = exteriorImgs.filter((img: string) => img.toLowerCase().includes('product-') || img.toLowerCase().includes('/exterior/'))
  }

  const carMarketing = landingData[carRichData.name] || landingData['VF 8'] || { design: {}, technology: {}, safety: {} }

  return (
    <main className="flex min-h-screen flex-col bg-background selection:bg-brand-500 selection:text-white">
      <Header />
      
      {/* HERO SECTION */}
      <section className="relative h-screen min-h-[700px] w-full flex flex-col justify-between overflow-hidden bg-black">
        <img 
          src={bannerImg} 
          alt={product.name}
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/20 to-black/80" />
        
        <div className="relative z-10 flex flex-col items-center mt-32 sm:mt-40 text-center px-6 animate-fade-in-up">
          {/* Removed logo overlay to not obstruct the banner */}
        </div>

        <div className="relative z-10 flex flex-col items-center pb-12 w-full animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
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
            {logoImg ? (
              <img src={logoImg} alt={product.name} className="h-8 object-contain hidden sm:block" style={{ filter: 'brightness(0)' }} />
            ) : (
              <h2 className="font-bold text-lg hidden sm:block">{product.name}</h2>
            )}
          </div>
          <div className="flex gap-6 text-sm font-semibold text-muted-foreground">
            <a href="#design" className="hover:text-foreground transition-colors">Thiết kế</a>
            <a href="#performance" className="hover:text-foreground transition-colors">Vận hành</a>
            <a href="#specs" className="hover:text-foreground transition-colors">Thông số</a>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-bold hidden md:block mr-2">{formatPrice(product.displayed_price)}</span>
            <Button size="sm" variant="outline" className="rounded-full font-bold border-brand-600 text-brand-600 hover:bg-brand-50 hidden sm:inline-flex">Dự toán</Button>
            <Button size="sm" className="rounded-full bg-brand-600 hover:bg-brand-700 text-white font-bold">Đặt cọc</Button>
          </div>
        </div>
      </div>

      {/* HIGHLIGHTS SECTION */}
      {specs.powertrain && (
        <section id="performance" className="py-24 bg-muted">
          <div className="max-w-[1440px] mx-auto px-6 lg:px-12">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 text-center divide-x divide-black/5">
              <div className="flex flex-col items-center">
                <p className="text-4xl md:text-5xl font-bold tracking-tighter mb-2">{String(specs.powertrain.distance || '').trim().split(' ')[0] || 'N/A'}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Quãng đường (km)</p>
              </div>
              <div className="flex flex-col items-center">
                <p className="text-4xl md:text-5xl font-bold tracking-tighter mb-2">{specs.powertrain.maxPower || 'N/A'}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Công suất (kW)</p>
              </div>
              <div className="flex flex-col items-center">
                <p className="text-4xl md:text-5xl font-bold tracking-tighter mb-2">{specs.powertrain.maxTorque || 'N/A'}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Mô-men xoắn (Nm)</p>
              </div>
              <div className="flex flex-col items-center">
                <p className="text-4xl md:text-5xl font-bold tracking-tighter mb-2">{String(specs.powertrain.fastChargingTime || '').split(' ')[0] || 'N/A'}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Sạc siêu tốc (phút)</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* COLOR SELECTOR */}
      <CarColorSelector colors={carColors} images={colorImages} />

      {/* DESIGN SECTION */}
      <section id="design" className="py-32 bg-background">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-12">
          <div className="mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">{carMarketing.design?.title || 'Thiết kế tương lai'}</h2>
            <p className="text-xl text-muted-foreground max-w-2xl">{carMarketing.design?.description}</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-16">
            {displayImgs[0] && (
              <div className="md:col-span-2 overflow-hidden rounded-[2rem]">
                <img src={displayImgs[0]} alt="Ngoại thất" className="w-full h-auto object-cover hover:scale-105 transition-transform duration-1000" />
              </div>
            )}
            {displayImgs[1] && (
              <div className="overflow-hidden rounded-[2rem] aspect-square">
                <img src={displayImgs[1]} alt="Ngoại thất" className="w-full h-full object-cover hover:scale-105 transition-transform duration-1000" />
              </div>
            )}
            {displayIntImgs[0] && (
              <div className="overflow-hidden rounded-[2rem] aspect-square relative group">
                <img src={displayIntImgs[0]} alt="Nội thất" className="w-full h-full object-cover hover:scale-105 transition-transform duration-1000" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-8 text-white">
                   <h3 className="text-2xl font-bold mb-2">{carMarketing.design?.interior_title || 'Nội thất đẳng cấp'}</h3>
                   <p className="text-white/80">{carMarketing.design?.interior_description}</p>
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
            <h2 className="text-4xl font-bold tracking-tight mb-6">{carMarketing.technology?.title || 'Công nghệ thông minh'}</h2>
            <p className="text-lg text-muted-foreground mb-12">{carMarketing.technology?.description}</p>
            <div className="grid grid-cols-2 gap-6">
               {carMarketing.technology?.features?.map((feat: string, idx: number) => (
                 <div key={idx} className="bg-white p-6 rounded-2xl shadow-sm border border-black/5 hover:shadow-md transition-shadow">
                   <Check className="text-brand-500 mb-4" size={24} />
                   <h4 className="font-bold text-slate-900">{feat}</h4>
                 </div>
               ))}
            </div>
          </div>
          <div>
            <h2 className="text-4xl font-bold tracking-tight mb-6">{carMarketing.safety?.title || 'An toàn tuyệt đối'}</h2>
            <p className="text-lg text-muted-foreground mb-12">{carMarketing.safety?.description}</p>
            <div className="grid grid-cols-2 gap-6">
               {carMarketing.safety?.features?.map((feat: string, idx: number) => (
                 <div key={idx} className="bg-black text-white p-6 rounded-2xl shadow-sm hover:bg-black/90 transition-colors">
                   <Check className="text-white mb-4" size={24} />
                   <h4 className="font-bold">{feat}</h4>
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
              <h3 className="text-2xl font-bold border-b border-black/10 pb-4 mb-6">Động cơ & Vận hành</h3>
              <ul className="space-y-4">
                {specs.powertrain && Object.entries(specs.powertrain).slice(0, 8).map(([k, v]: any) => (
                  <li key={k} className="flex justify-between py-2 border-b border-black/5 text-sm">
                    <span className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <span className="font-semibold text-right max-w-[50%]">{v}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            <div>
              <h3 className="text-2xl font-bold border-b border-black/10 pb-4 mb-6">Kích thước</h3>
              <ul className="space-y-4">
                {specs.dimension && Object.entries(specs.dimension).map(([k, v]: any) => (
                  <li key={k} className="flex justify-between py-2 border-b border-black/5 text-sm">
                    <span className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <span className="font-semibold text-right max-w-[50%]">{v}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          
          <div className="mt-16 flex justify-center">
            <Button variant="outline" className="rounded-full px-8 border-black text-black hover:bg-black/5 font-bold">Xem bản PDF Thông số chi tiết</Button>
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
