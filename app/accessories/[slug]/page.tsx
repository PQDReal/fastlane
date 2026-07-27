import { notFound } from 'next/navigation'

import { AccessoryDetailClient } from '@/components/accessory-detail-client'
import { Footer } from '@/components/footer'
import { Header } from '@/components/header'
import { getAccessoryCatalogProductBySlug } from '@/lib/catalog/server'

export const dynamic = 'force-dynamic'

export default async function AccessoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ variant?: string }>
}) {
  const { slug } = await params
  const requestedSku = (await searchParams)?.variant?.trim().toUpperCase()
  const product = await getAccessoryCatalogProductBySlug(slug)

  if (!product || product.variants.length === 0) notFound()

  const initialVariantId = requestedSku
    ? product.variants.find((variant) => variant.sku.toUpperCase() === requestedSku)?.id
    : undefined

  return (
    <main className="min-h-screen bg-slate-50 pt-[74px]">
      <Header />
      <AccessoryDetailClient
        product={product}
        initialVariantId={initialVariantId}
      />
      <Footer />
    </main>
  )
}
