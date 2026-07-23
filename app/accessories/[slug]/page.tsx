import { notFound } from 'next/navigation'

import { AccessoryDetailClient } from '@/components/accessory-detail-client'
import { Footer } from '@/components/footer'
import { Header } from '@/components/header'
import type { AccessoryDetailData } from '@/lib/cart/types'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export default async function AccessoryDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { data, error } = await getSupabaseAdmin()
    .from('products')
    .select(`
      id,
      slug,
      name,
      description,
      specifications,
      image_urls,
      product_variants!inner(
        id,
        sku,
        name,
        original_price,
        sale_price,
        is_active,
        inventory_items(on_hand_quantity)
      )
    `)
    .eq('slug', slug)
    .eq('product_type', 'ACCESSORY')
    .eq('is_active', true)
    .eq('product_variants.is_active', true)
    .maybeSingle()

  if (error || !data) notFound()

  const images = Array.isArray(data.image_urls)
    ? data.image_urls.filter((image): image is string => typeof image === 'string' && image.length > 0)
    : []
  const fallbackImage = images[0] || '/images/vf8.png'
  const variants = (data.product_variants || []).map((variant) => {
    const inventory = Array.isArray(variant.inventory_items)
      ? variant.inventory_items[0]
      : variant.inventory_items
    const listPrice = Number(variant.original_price)
    const salePrice = variant.sale_price === null ? null : Number(variant.sale_price)
    const priceAmount = salePrice ?? listPrice

    return {
      productId: data.id,
      productSlug: data.slug,
      variantId: variant.id,
      sku: variant.sku,
      name: variant.name === 'Mặc định' ? data.name : variant.name,
      priceAmount,
      oldPriceAmount: salePrice !== null && salePrice < listPrice ? listPrice : null,
      image: fallbackImage,
      rating: 4.8,
      availableQuantity: Math.max(0, Number(inventory?.on_hand_quantity ?? 0)),
      discount: salePrice !== null && salePrice < listPrice
        ? Math.round((1 - salePrice / listPrice) * 100)
        : null,
    }
  })

  if (variants.length === 0) notFound()

  const specifications =
    data.specifications && typeof data.specifications === 'object' && !Array.isArray(data.specifications)
      ? (data.specifications as Record<string, unknown>)
      : {}
  const product: AccessoryDetailData = {
    productId: data.id,
    slug: data.slug,
    name: data.name,
    description: data.description,
    images: images.length > 0 ? images : [fallbackImage],
    specifications,
    variants,
  }

  return (
    <main className="min-h-screen bg-slate-50 pt-[74px]">
      <Header />
      <AccessoryDetailClient product={product} />
      <Footer />
    </main>
  )
}
