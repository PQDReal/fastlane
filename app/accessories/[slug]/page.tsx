import { notFound } from 'next/navigation'

import { AccessoryDetailClient } from '@/components/accessory-detail-client'
import { Footer } from '@/components/footer'
import { Header } from '@/components/header'
import type { AccessoryDetailData } from '@/lib/cart/types'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export default async function AccessoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ variant?: string }>
}) {
  const { slug } = await params
  const requestedVariant = (await searchParams)?.variant
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
  const specifications =
    data.specifications && typeof data.specifications === 'object' && !Array.isArray(data.specifications)
      ? (data.specifications as Record<string, unknown>)
      : {}
  const sourceVariants = Array.isArray(specifications.variants) ? specifications.variants : []
  const sourceBySku = new Map(sourceVariants.map((variant: any) => [
    String(variant.sku || variant.variant_id).toUpperCase(),
    variant,
  ]))
  const variants = (data.product_variants || []).map((variant) => {
    const inventory = Array.isArray(variant.inventory_items)
      ? variant.inventory_items[0]
      : variant.inventory_items
    const listPrice = Number(variant.original_price)
    const salePrice = variant.sale_price === null ? null : Number(variant.sale_price)
    const priceAmount = salePrice ?? listPrice
    const sourceVariant: any = sourceBySku.get(String(variant.sku).toUpperCase())
    const variantImages = [...new Set([
      sourceVariant?.image,
      ...(Array.isArray(sourceVariant?.images) ? sourceVariant.images : []),
    ].filter((url): url is string => typeof url === 'string' && url.length > 0))]
    const variantImage = variantImages[0] || fallbackImage
    const attributes = sourceVariant?.attributes
      && typeof sourceVariant.attributes === 'object'
      && !Array.isArray(sourceVariant.attributes)
      ? sourceVariant.attributes as Record<string, string>
      : {}

    return {
      productId: data.id,
      productSlug: data.slug,
      variantId: variant.id,
      sku: variant.sku,
      variantName: variant.name,
      name: variant.name === 'Mặc định' ? data.name : variant.name,
      priceAmount,
      oldPriceAmount: salePrice !== null && salePrice < listPrice ? listPrice : null,
      image: variantImage,
      images: variantImages.length > 0 ? variantImages : [variantImage],
      attributes,
      availableQuantity: Math.max(0, Number(inventory?.on_hand_quantity ?? 0)),
      discount: salePrice !== null && salePrice < listPrice
        ? Math.round((1 - salePrice / listPrice) * 100)
        : null,
    }
  })

  if (variants.length === 0) notFound()

  const specificationText = typeof specifications.specification_text === 'string'
    ? specifications.specification_text.trim()
    : ''
  const detailSpecifications = specifications.specifications
    && typeof specifications.specifications === 'object'
    && !Array.isArray(specifications.specifications)
    ? specifications.specifications as Record<string, unknown>
    : {}

  const product: AccessoryDetailData = {
    productId: data.id,
    slug: data.slug,
    name: data.name,
    description: specificationText || data.description,
    images: images.length > 0 ? images : [fallbackImage],
    specifications: detailSpecifications,
    variants,
    initialVariantId: variants.find((variant) => variant.sku === requestedVariant)?.variantId,
  }

  return (
    <main className="min-h-screen bg-slate-50 pt-[74px]">
      <Header />
      <AccessoryDetailClient product={product} />
      <Footer />
    </main>
  )
}
