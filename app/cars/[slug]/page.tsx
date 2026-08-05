import { notFound } from 'next/navigation'
import { Header } from '../../../components/header'
import { Footer } from '../../../components/footer'
import { CarColorSelector } from '../../../components/car-color-selector'
import { getSupabaseAdmin } from '../../../lib/supabase-admin'
import fs from 'fs'
import path from 'path'
import { Button } from '../../../components/ui/button'
import { Check, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { carDetailCacheKey } from '../../../lib/cache-keys'
import { readRedisJson, writeRedisJson } from '../../../lib/redis'

export const dynamic = 'force-dynamic'

const SPEC_TRANSLATIONS: Record<string, string> = {
  // Powertrain specs
  maxPower: 'Công suất tối đa',
  maxTorque: 'Mô-men xoắn cực đại',
  drivetrain: 'Hệ dẫn động',
  frontSuspension: 'Hệ thống treo trước',
  rearSuspension: 'Hệ thống treo sau',
  steering: 'Hệ thống lái',
  distance: 'Quãng đường di chuyển',
  batteryCapacity: 'Dung lượng pin',
  fastChargingTime: 'Thời gian sạc nhanh',
  maxACCharging: 'Công suất sạc AC',
  maxDCCharging: 'Công suất sạc DC',
  topSpeed: 'Tốc độ tối đa',
  chargingTime: 'Thời gian sạc',
  
  // Dimension specs
  length: 'Kích thước (D x R x C)',
  wheelbase: 'Chiều dài cơ sở',
  kurbWeightPayload: 'Khối lượng / Tải trọng',
  croundClearance: 'Khoảng sáng gầm xe',
  width: 'Chiều rộng',
  height: 'Chiều cao',
  weight: 'Khối lượng',
  
  // Other specs
  seats: 'Số chỗ ngồi',
  usableBattery: 'Dung lượng sử dụng',
  fastCharging: 'Sạc nhanh',
  maxChargingPower: 'Công suất sạc tối đa'
}

const translateSpecKey = (key: string): string => {
  return SPEC_TRANSLATIONS[key] || key.replace(/([A-Z])/g, ' $1').trim()
}

const MAIN_POWERTRAIN_KEYS = [
  'maxPower',
  'maxTorque',
  'distance',
  'batteryCapacity',
  'fastChargingTime',
  'topSpeed',
  'drivetrain'
]

const MAIN_DIMENSION_KEYS = [
  'length',
  'wheelbase',
  'croundClearance',
  'kurbWeightPayload',
  'seats',
  'numberOfSeats',
  'airbagSystem'
]

const formatSpecValue = (key: string, value: any): string => {
  if (value === null || value === undefined) return 'Chưa cập nhật'
  const str = String(value).trim()
  if (!str || str === 'null' || str === 'undefined') return 'Chưa cập nhật'
  
  const lowerVal = str.toLowerCase()
  const hasUnit = lowerVal.includes('hp') || lowerVal.includes('kw') || lowerVal.includes('nm') || 
                  lowerVal.includes('mm') || lowerVal.includes('km') || lowerVal.includes('phút') || 
                  lowerVal.includes('lần sạc') || lowerVal.includes('chỗ') || lowerVal.includes('túi') ||
                  lowerVal.includes('ghế')
  if (hasUnit) return str

  if (key === 'maxPower') {
    return `${str} hp`
  }
  if (key === 'maxTorque') {
    return `${str} Nm`
  }
  if (key === 'wheelbase') {
    const num = parseInt(str.replace(/[^0-9]/g, ''), 10)
    if (!isNaN(num)) {
      return num > 100 ? `${new Intl.NumberFormat('vi-VN').format(num)} mm` : `${num} mm`
    }
    return `${str} mm`
  }
  if (key === 'croundClearance') {
    return `${str} mm`
  }
  if (key === 'batteryCapacity') {
    return `${str} kWh`
  }
  if (key === 'distance') {
    return `${str} km`
  }
  if (key === 'topSpeed') {
    return `${str} km/h`
  }
  if (key === 'seats' || key === 'numberOfSeats') {
    return `${str} ghế`
  }
  if (key === 'airbagSystem') {
    return `${str} túi khí`
  }
  
  return str
}


export default async function CarDetailPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params
  const cacheKey = carDetailCacheKey(params.slug)
  type CarDetailCache = { product: any | null; variantsData: any[] }
  const cached = await readRedisJson<CarDetailCache>(cacheKey)
  let product: any | null = cached?.product ?? null
  let variantsData: any[] = cached?.variantsData ?? []

  if (!cached) {
    const supabase = getSupabaseAdmin()
    const [{ data: loadedProduct }, { data: loadedVariants }] = await Promise.all([
      supabase
        .from('products')
        .select('*, category:categories!inner(name)')
        .eq('slug', params.slug)
        .eq('is_active', true)
        .eq('categories.name', 'Ô tô điện')
        .maybeSingle(),
      supabase
        .from('vehicle_variants')
        .select('*')
        .eq('is_active', true),
    ])
    product = loadedProduct
    variantsData = product
      ? (loadedVariants ?? []).filter((variant: any) => variant.product_id === product.id)
      : []
    await writeRedisJson(cacheKey, { product, variantsData }, 300)
  }

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
  let carRichData = carsData.find((c: any) => c.name === product.name)
  if (!carRichData) {
    carRichData = carsData.find((c: any) => product.name.includes(c.name) || c.name.includes(product.name))
  }
  if (!carRichData) carRichData = carsData[0] 
  
  let carSpecs = specsData[carRichData.name]
  if (!carSpecs) {
    carSpecs = JSON.parse(JSON.stringify(specsData['VF 8']))
    if (carRichData.name.includes('All-New')) {
      carSpecs.variants = {
        'Comfort': { price: product.displayed_price, specs: carSpecs.variants['Eco']?.specs }
      }
    } else if (!carRichData.name.includes('VF 8')) {
      carSpecs.variants = {} 
    }
  }

  const formatPrice = (price: number) => new Intl.NumberFormat('vi-VN').format(price) + ' ₫'

  const exteriorImgs = carRichData.gallery?.exterior_images || []
  const interiorImgs = carRichData.gallery?.interior_images || []

  let bannerImg = carRichData.gallery?.banner_images?.find((img: string) => !img.includes('mobile') && !img.includes('_mb')) 
    || carRichData.gallery?.banner_images?.[0] 
    || product.image_urls?.[0] 
    || '/images/vf8.png'

  if (product.name === 'VF 3') {
    bannerImg = carRichData.gallery?.exterior_images?.[1] || bannerImg
  } else if (product.slug === 'vf-8-all-new' || product.name.toLowerCase().includes('vf 8 the all')) {
    bannerImg = 'https://vinfastauto.com/themes/porto/img/vf8-new-product/hero-banner.svg'
  } else if (product.name.includes('MPV')) {
    bannerImg = 'https://static-cms-prod.vinfastauto.com/pdp/vf_mpv_7/M_01.webp'
  }

  let logoImg = [...exteriorImgs, ...interiorImgs, ...(carRichData.gallery?.all_images || [])].find((img: string) => img.toLowerCase().includes('logo') || img.toLowerCase().endsWith('.svg'))
  
  if (product.name === 'VF 2') {
    logoImg = 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1785200413351/images/logo/VF2.svg'
  } else if (product.slug === 'vf-8-all-new' || product.name.toLowerCase().includes('vf 8 the all')) {
    logoImg = 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1785200413351/images/logo/VF8-THE-ALL-NEW.svg'
  } else if (product.name.includes('MPV')) {
    logoImg = 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1785200413351/images/logo/VFMPV7.svg'
  }
  
  const validExteriorImgs = exteriorImgs.filter((img: string) => !img.toLowerCase().includes('logo') && !img.toLowerCase().endsWith('.mp4') && !img.toLowerCase().endsWith('.svg') && !img.toLowerCase().includes('banner') && !img.toLowerCase().includes('tvc') && !img.includes('vf3.jpg') && !img.toLowerCase().includes('separate-line') && !img.toLowerCase().includes('/icon/') && !img.toLowerCase().includes('charging'))
  const validInteriorImgs = interiorImgs.filter((img: string) => !img.toLowerCase().includes('logo') && !img.toLowerCase().endsWith('.mp4') && !img.toLowerCase().endsWith('.svg') && !img.toLowerCase().includes('banner') && !img.toLowerCase().includes('tvc') && !img.toLowerCase().includes('separate-line') && !img.toLowerCase().includes('/icon/') && !img.toLowerCase().includes('charging'))

  // Sometimes all images are in 'all_images' and exterior/interior is empty
  const fallbackImgs = (carRichData.gallery?.all_images || []).filter((img: string) => !img.toLowerCase().includes('logo') && !img.toLowerCase().endsWith('.mp4') && !img.toLowerCase().endsWith('.svg') && !img.toLowerCase().includes('banner') && !img.toLowerCase().includes('tvc') && !img.toLowerCase().includes('separate-line') && !img.toLowerCase().includes('/icon/') && !img.toLowerCase().includes('charging'))
  
  let displayImgs = [...(validExteriorImgs.length > 0 ? validExteriorImgs : fallbackImgs)]
  let displayIntImgs = [...(validInteriorImgs.length > 0 ? validInteriorImgs : fallbackImgs.slice(3))]

  if (product.slug === 'vf-8-all-new' || product.name.toLowerCase().includes('vf 8 the all')) {
    displayImgs[1] = 'https://vinfastauto.com/themes/porto/img/vf8-new-product/tech/tech3.png'
  } else if (product.name.includes('MPV')) {
    displayImgs[1] = 'https://static-cms-prod.vinfastauto.com/pdp/vf_mpv_7/M_02.webp'
    displayImgs[2] = 'https://static-cms-prod.vinfastauto.com/pdp/vf_mpv_7/M_03.webp'
    displayIntImgs[0] = 'https://static-cms-prod.vinfastauto.com/pdp/vf_mpv_7/M_05.webp'
  }

  const variantKeys = Object.keys(carSpecs.variants || {})
  const firstVariant = variantKeys.length > 0 ? carSpecs.variants[variantKeys[0]] : null
  const specs = firstVariant?.specs || {}

  const dimensionSpecs = {
    ...(specs.dimension || {}),
    ...(specs.interior?.numberOfSeats ? { seats: specs.interior.numberOfSeats } : {}),
    ...(specs.safety?.airbagSystem ? { airbagSystem: specs.safety.airbagSystem } : {})
  }

  // Extract images that look like colored variants
  const uniqueColorsMap = new Map()
  variantsData?.forEach(v => {
    if (v.color && v.image_car_url && !uniqueColorsMap.has(v.color)) {
      uniqueColorsMap.set(v.color, {
        name: v.color,
        swatch: v.image_color_url,
        image: v.image_car_url
      })
    }
  })
  
  const dbColorsArr = Array.from(uniqueColorsMap.values())
  const dbCarColors = dbColorsArr.map(c => ({ name: c.name, swatch: c.swatch }))
  const dbColorImages = dbColorsArr.map(c => c.image)

  const fallbackCarColors = carRichData.colors || []
  let fallbackColorImages = fallbackCarColors.map((c: any) => typeof c === 'object' && c.image ? c.image : null).filter(Boolean)
  if (fallbackColorImages.length === 0) {
    fallbackColorImages = exteriorImgs.filter((img: string) => img.toLowerCase().includes('product-') || img.toLowerCase().includes('/exterior/'))
  }

  const carColors = dbCarColors.length > 0 ? dbCarColors : fallbackCarColors
  const colorImages = dbColorImages.length > 0 ? dbColorImages : fallbackColorImages

  const carMarketing = landingData[carRichData.name] || landingData['VF 8'] || { design: {}, technology: {}, safety: {} }
  const isVF6 = product.name === 'VF 6'
  const depositHref = `/deposit?type=car&model=${encodeURIComponent(product.name)}`
  const testDriveHref = `/test-drive?productId=${encodeURIComponent(product.id)}`

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
            <Link href={testDriveHref} className="flex h-12 items-center justify-center rounded-full bg-white px-8 text-sm font-bold uppercase tracking-widest text-black shadow-xl transition-all hover:scale-105 hover:bg-white/90 active:scale-95 sm:h-14 sm:px-12 sm:text-base">
              Trải nghiệm
            </Link>
            <Link href={depositHref} className="h-12 sm:h-14 px-8 sm:px-12 rounded-full bg-transparent border-2 border-white text-white font-bold uppercase tracking-widest text-sm sm:text-base hover:bg-white/10 transition-all hover:scale-105 active:scale-95 shadow-xl backdrop-blur-sm flex items-center justify-center">
              Đặt cọc ngay
            </Link>
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
            {variantKeys.length > 1 && <a href="#variants" className="hover:text-foreground transition-colors">Phiên bản</a>}
            <a href="#design" className="hover:text-foreground transition-colors">Thiết kế</a>
            <a href="#performance" className="hover:text-foreground transition-colors">Vận hành</a>
            <a href="#specs" className="hover:text-foreground transition-colors">Thông số</a>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-bold hidden md:block mr-2">{formatPrice(product.displayed_price)}</span>
            <Button size="sm" variant="outline" className="rounded-full font-bold border-brand-600 text-brand-600 hover:bg-brand-50 hidden sm:inline-flex" asChild>
              <Link href={{ pathname: '/cost-estimator', query: { vehicle: product.slug } }}>Dự toán</Link>
            </Button>
            <Button size="sm" className="rounded-full bg-brand-600 hover:bg-brand-700 text-white font-bold" asChild>
              <Link href={depositHref}>Đặt cọc</Link>
            </Button>
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

      {/* VARIANTS PRICING SECTION */}
      {variantKeys.length > 1 && (
        <section id="variants" className="relative py-32 bg-black overflow-hidden flex items-center justify-center min-h-[600px]">
           <img src={displayIntImgs[0] || bannerImg} alt="Interior" className="absolute inset-0 w-full h-full object-cover opacity-70"/>
           
           <div className="relative z-10 w-full max-w-4xl mx-auto px-6">
             <div className="bg-white/70 backdrop-blur-xl p-8 sm:p-14 shadow-2xl">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-12 sm:gap-8 mb-12">
                  {variantKeys.map(vk => {
                    const variantData = carSpecs.variants[vk]
                    const originalPrice = variantData.price || product.displayed_price
                    const discountPrice = originalPrice * 0.95 // 5% discount
                    const formatNum = (n: number) => new Intl.NumberFormat('vi-VN').format(n)
                    
                    return (
                      <div key={vk} className="px-4">
                        <h3 className="text-3xl sm:text-4xl font-light mb-8 text-slate-900">{product.name} {vk}</h3>
                        <p className="text-sm font-medium mb-2 text-slate-800">Giá bán từ</p>
                        <div className="flex items-baseline gap-2 mb-2 text-slate-900">
                           <span className="text-3xl sm:text-4xl font-light">{formatNum(discountPrice)}</span>
                           <span className="text-sm font-bold">VNĐ*</span>
                        </div>
                        <div className="flex items-baseline gap-2 opacity-50 line-through text-slate-700">
                           <span className="text-lg">{formatNum(originalPrice)}</span>
                           <span className="text-xs font-bold">VNĐ*</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
                
                <div className="flex justify-center mb-8 px-4">
                  <Button className="bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-none h-14 font-bold tracking-widest w-full sm:max-w-md shadow-lg transition-colors" asChild>
                    <Link href={depositHref}>ĐẶT CỌC</Link>
                  </Button>
                </div>
                <p className="text-center text-sm text-slate-700/80 px-4">(*) Mức giá ưu đãi mang tính chất tham khảo. Chương trình áp dụng theo điều khoản & điều kiện.</p>
             </div>
           </div>
        </section>
      )}

      {/* DESIGN SECTION */}
      {isVF6 ? (
        <section id="design" className="py-24 bg-white">
          <div className="max-w-[1200px] mx-auto px-6 lg:px-12">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              {/* Left Column */}
              <div className="flex flex-col">
                <h2 className="text-2xl font-semibold mb-2 text-[#1a1a1a]">Triết lý thiết kế "Cặp đôi lập tự nhiên"</h2>
                <p className="text-sm text-slate-500 mb-12">VF 6 là tuyệt tác nghệ thuật được thiết kế dựa trên triết lý "Cặp đôi lập tự nhiên", tạo nên sự cân bằng hoàn hảo giữa các yếu tố tưởng chừng như đối lập: thú vị - tinh tế, công nghệ - con người.</p>
                
                <img src="https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dwd1f6c90c/reserves/VF6/2026/naturel.webp" alt="Ngoại thất" className="w-full aspect-[4/5] object-cover mb-6" />
                <h3 className="text-lg font-semibold mb-2 text-[#1a1a1a]">Ngoại thất</h3>
                <p className="text-sm text-slate-500">Thiết kế ngoại thất được khởi tạo từ những đường nét tinh tế đến từng chi tiết cùng vẻ ngoài năng động, ấn tượng ngay từ ánh nhìn đầu tiên.</p>
              </div>

              {/* Right Column */}
              <div className="flex flex-col gap-16">
                <div>
                  <img src="https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw3cec264f/reserves/VF6/interior-vf6-1.jpg" alt="Nội thất" className="w-full aspect-[4/3] object-cover mb-6" />
                  <h3 className="text-lg font-semibold mb-2 text-[#1a1a1a]">Nội thất</h3>
                  <p className="text-sm text-slate-500">Thiết kế nội thất lấy cảm hứng từ ngôi nhà thứ hai của gia đình với không gian rộng rãi, thoải mái cùng hai màu nội thất và chất liệu tự nhiên, thân thiện với người dùng.</p>
                </div>
                <div>
                  <img src="https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw85404d6b/reserves/VF6/technology-vf6-3.jpg" alt="Công nghệ" className="w-full aspect-[4/3] object-contain mb-6" />
                  <h3 className="text-lg font-semibold mb-2 text-[#1a1a1a]">Công nghệ</h3>
                  <p className="text-sm text-slate-500">VF 6 mang đến cho người dùng cả "thế giới công nghệ" với trợ lý ảo VinFast cùng nhiều tính năng an toàn, giải trí và tiện ích đẳng cấp.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : (
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
      )}

      {/* TECHNOLOGY & SAFETY SECTION */}
      {!isVF6 && (
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
      )}

      {/* FULL SPECS SECTION */}
      {isVF6 ? (
        <section id="specs" className="py-24 bg-white relative">
          <div className="max-w-[1200px] mx-auto px-6 lg:px-12">
            
            {/* Header Block with Gray Background */}
            <div className="bg-[#f8f9fa] w-full p-8 sm:p-12 mb-16 flex flex-col md:flex-row items-center relative overflow-hidden">
              <div className="relative z-10 w-full md:w-1/2 flex flex-col items-center justify-center min-h-[160px]">
                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[120px] sm:text-[180px] font-black text-slate-200/60 italic tracking-tighter select-none whitespace-nowrap">VF6</span>
                <h2 className="relative z-20 text-xl sm:text-2xl font-medium mt-16 text-slate-800 whitespace-nowrap">Khả năng vận hành vượt trội</h2>
              </div>
              <div className="relative z-10 w-full md:w-1/2 mt-8 md:mt-0 text-center md:text-left md:pl-16">
                <p className="text-sm text-slate-600 leading-relaxed font-medium">Với sức mạnh của động cơ điện tương đương với những mẫu xe thuộc phân khúc C-SUV, VF 6 chắc chắn sẽ thỏa mãn niềm đam mê cầm lái của chủ sở hữu, tự tin chinh phục mọi địa hình.</p>
              </div>
            </div>
            
            <div className="max-w-[1000px] mx-auto">
              <table className="w-full text-sm text-left mb-12">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="py-4 font-normal text-slate-400 w-1/3"></th>
                    <th className="py-4 font-normal text-slate-600 text-lg w-1/3">VF 6 Eco</th>
                    <th className="py-4 font-normal text-slate-600 text-lg w-1/3">VF 6 Plus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-700">
                  <tr>
                    <td className="py-4 font-medium text-xs">Dài x Rộng x Cao (mm)</td>
                    <td className="py-4 font-semibold text-xs text-slate-900">4.241 x 1.834 x 1.580</td>
                    <td className="py-4 font-semibold text-xs text-slate-900">4.241 x 1.834 x 1.580</td>
                  </tr>
                  <tr>
                    <td className="py-4 font-medium text-xs">Chiều dài cơ sở</td>
                    <td className="py-4 font-semibold text-xs text-slate-900">2.730 mm</td>
                    <td className="py-4 font-semibold text-xs text-slate-900">2.730 mm</td>
                  </tr>
                  <tr>
                    <td className="py-4 font-medium text-xs">Quãng đường di chuyển (NEDC)*</td>
                    <td className="py-4 font-semibold text-xs text-slate-900">485 km/lần sạc</td>
                    <td className="py-4 font-semibold text-xs text-slate-900">460 km/lần sạc</td>
                  </tr>
                  <tr>
                    <td className="py-4 font-medium text-xs">Công suất tối đa</td>
                    <td className="py-4 font-semibold text-xs text-slate-900">130 kW/174 hp</td>
                    <td className="py-4 font-semibold text-xs text-slate-900">150 kW/201 hp</td>
                  </tr>
                  <tr>
                    <td className="py-4 font-medium text-xs">Mô-men xoắn cực đại</td>
                    <td className="py-4 font-semibold text-xs text-slate-900">250 Nm</td>
                    <td className="py-4 font-semibold text-xs text-slate-900">310 Nm</td>
                  </tr>
                  <tr>
                    <td className="py-4 font-medium text-xs">Kích thước La-zăng</td>
                    <td className="py-4 font-semibold text-xs text-slate-900">17 inch</td>
                    <td className="py-4 font-semibold text-xs text-slate-900">18 inch</td>
                  </tr>
                </tbody>
              </table>
              
              <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
                <Button className="bg-[#e19200] hover:bg-blue-700 text-white rounded-none w-[200px] py-6 uppercase font-bold text-xs tracking-wider">NHẬN TƯ VẤN</Button>
                <Button variant="outline" className="border-[#e19200] text-[#e19200] hover:bg-blue-50 rounded-none w-[200px] py-6 uppercase font-bold text-xs tracking-wider">XEM CHI TIẾT</Button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section id="specs" className="py-32 bg-white text-foreground">
          <div className="max-w-[1440px] mx-auto px-6 lg:px-12">
            <h2 className="text-4xl font-bold tracking-tight mb-16">Thông số kỹ thuật {product.name}</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
              <div>
                <h3 className="text-2xl font-bold border-b border-black/10 pb-4 mb-6">Động cơ & Vận hành</h3>
                <ul className="space-y-4">
                  {specs.powertrain && Object.entries(specs.powertrain)
                    .filter(([k]) => MAIN_POWERTRAIN_KEYS.includes(k))
                    .map(([k, v]: any) => (
                      <li key={k} className="flex justify-between py-2 border-b border-black/5 text-sm">
                        <span className="text-muted-foreground">{translateSpecKey(k)}</span>
                        <span className="font-semibold text-right max-w-[50%]">{formatSpecValue(k, v)}</span>
                      </li>
                    ))}
                </ul>
              </div>
              
              <div>
                <h3 className="text-2xl font-bold border-b border-black/10 pb-4 mb-6">Kích thước & Tiện ích</h3>
                <ul className="space-y-4">
                  {Object.entries(dimensionSpecs)
                    .filter(([k]) => MAIN_DIMENSION_KEYS.includes(k))
                    .map(([k, v]: any) => (
                      <li key={k} className="flex justify-between py-2 border-b border-black/5 text-sm">
                        <span className="text-muted-foreground">{translateSpecKey(k)}</span>
                        <span className="font-semibold text-right max-w-[50%]">{formatSpecValue(k, v)}</span>
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
      )}

      {/* FINAL CTA */}
      <section className="py-32 bg-[#171411] text-white text-center">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-4xl sm:text-6xl font-bold tracking-tight mb-8">Sẵn sàng trải nghiệm?</h2>
          <p className="text-xl text-white/70 mb-12">Gia nhập cộng đồng người dùng xe điện toàn cầu cùng VinFast.</p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
             <Button variant="default" className="bg-white text-black hover:bg-white/90 h-14 px-10 rounded-full font-bold uppercase tracking-wider text-sm transition-transform hover:scale-105" asChild>
               <Link href={depositHref}>Đặt cọc ngay</Link>
            </Button>
            <Button variant="outline" className="h-14 px-10 rounded-full border-white/20 text-white hover:bg-white/10 font-bold uppercase tracking-wider text-sm" asChild>
              <Link href={testDriveHref}>Đăng ký lái thử</Link>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
