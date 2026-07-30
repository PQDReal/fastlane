import { Header } from '../../components/header'
import { Footer } from '../../components/footer'
import { ChevronRight } from 'lucide-react'
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
      
      <div className="bg-muted py-24 border-b border-black/5">
        <div className="mx-auto max-w-[1440px] px-6 lg:px-12 text-center">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-8">
            <Link href="/" className="hover:text-brand-600 transition-colors">Trang chủ</Link>
            <ChevronRight size={14} />
            <span className="text-foreground">Xe máy điện</span>
          </div>
          <h1 className="text-5xl font-bold tracking-tight text-foreground sm:text-7xl">Xe máy điện</h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            Giải pháp di chuyển đô thị thông minh, thân thiện với môi trường, thiết kế thời trang và vận hành êm ái.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[1440px] px-6 lg:px-12 py-16 w-full">
        <BikeCatalogBrowser bikes={bikes} />
      </div>

      <Footer />
    </main>
  )
}
