import { Header } from '../../components/header'
import { Footer } from '../../components/footer'
import { BatteryCharging, ChevronRight, Leaf, Zap } from 'lucide-react'
import Link from 'next/link'
import { getSupabaseAdmin } from '../../lib/supabase-admin'
import { getProductImage } from '../../lib/get-product-image'
import { getBikeListingImage } from '../../lib/bike-images'
import { BikeCatalogBrowser } from './bike-catalog-browser'

export const dynamic = 'force-dynamic'

export default async function BikesPage() {
  const supabase = getSupabaseAdmin()
  const { data: rawBikes } = await supabase
    .from('products')
    .select(`*, category:categories!inner(name)`)
    .eq('is_active', true)
    .eq('categories.name', 'Xe máy điện')
    .order('name', { ascending: true })
    .order('id', { ascending: true })
    .limit(100)
  
  const bikesData = rawBikes || []

  const bikes = bikesData.map((bike) => {
    const specifications =
      bike.specifications &&
      typeof bike.specifications === 'object' &&
      !Array.isArray(bike.specifications)
        ? bike.specifications
        : {}

    const colorDetails = Array.isArray(specifications.color_details)
      ? specifications.color_details
      : []


    const colorDetailImage = colorDetails
      .map((color: any) =>
        typeof color?.image_url === 'string'
          ? color.image_url
          : typeof color?.image === 'string'
            ? color.image
            : null,
      )
      .find(
        (image: string | null): image is string =>
          typeof image === 'string' &&
          /\.(jpeg|jpg|gif|png|webp|avif)(?:\?.*)?$/i.test(image),
      )

    const image = getBikeListingImage(
      bike.slug,
      bike.image_urls,
      colorDetailImage ??
        getProductImage(
          bike.name,
          null,
          '/images/vento.png',
        ),
    )

    return {
      name: bike.name,
      desc: bike.description || 'Xe máy điện VinFast',
      price: Number(bike.displayed_price ?? 0),
      image,
      href: `/bikes/${bike.slug}`,
    }
  })

  return (
    <main className="flex min-h-screen flex-col bg-background pt-[74px]">
      <Header />
      
      <section className="relative overflow-hidden border-b border-black/5 bg-muted py-20 sm:py-28">
        <div className="pointer-events-none absolute -left-24 top-8 h-72 w-72 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-slate-900/10 blur-3xl" />
        <div className="relative mx-auto max-w-[1440px] px-6 text-center lg:px-12">
          <div className="mb-8 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <Link href="/" className="transition-colors hover:text-brand-600">Trang chủ</Link>
            <ChevronRight size={14} />
            <span className="text-foreground">Xe máy điện</span>
          </div>
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.32em] text-brand-700">
            Di chuyển xanh mỗi ngày
          </p>
          <h1 className="text-5xl font-bold tracking-[-0.04em] text-foreground sm:text-7xl">
            Xe máy điện
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            Giải pháp di chuyển đô thị thông minh, thân thiện với môi trường, thiết kế thời trang và vận hành êm ái.
          </p>
          <div className="mx-auto mt-10 grid max-w-2xl grid-cols-3 divide-x divide-black/10 rounded-2xl border border-black/5 bg-white/60 px-3 py-5 shadow-sm backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 px-2">
              <Zap size={19} className="text-brand-600" />
              <span className="text-xs font-semibold sm:text-sm">Vận hành êm ái</span>
            </div>
            <div className="flex flex-col items-center gap-2 px-2">
              <BatteryCharging size={19} className="text-brand-600" />
              <span className="text-xs font-semibold sm:text-sm">{bikes.length} dòng xe</span>
            </div>
            <div className="flex flex-col items-center gap-2 px-2">
              <Leaf size={19} className="text-brand-600" />
              <span className="text-xs font-semibold sm:text-sm">Không khí thải</span>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1440px] px-6 py-16 lg:px-12">
        <BikeCatalogBrowser bikes={bikes} />
      </div>

      <Footer />
    </main>
  )
}
