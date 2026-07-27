import { notFound } from 'next/navigation'

import { AccessoryDetailClient } from '@/components/accessory-detail-client'
import { Footer } from '@/components/footer'
import { Header } from '@/components/header'
import { parseAccessoryFilters } from '@/lib/catalog/accessory-filters'
import {
  getAccessoryCatalogProductBySlug,
  listAccessoryCatalog,
} from '@/lib/catalog/server'

export const dynamic = 'force-dynamic'

export default async function AccessoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ variant?: string; vehicle?: string }>
}) {
  const { slug } = await params
  const resolvedSearchParams = await searchParams
  const requestedSku = resolvedSearchParams?.variant?.trim().toUpperCase()
  const selectedVehicle = resolvedSearchParams?.vehicle?.trim() || undefined
  const product = await getAccessoryCatalogProductBySlug(slug)

  if (!product || product.variants.length === 0) notFound()

  const initialVariantId = requestedSku
    ? product.variants.find((variant) => variant.sku.toUpperCase() === requestedSku)?.id
    : undefined
  const relatedFilters = parseAccessoryFilters(selectedVehicle
    ? { vehicle: selectedVehicle }
    : { category: product.content.sourceCategory ?? undefined })
  const relatedPage = await listAccessoryCatalog({
    pageSize: 8,
    filters: relatedFilters,
  })
  const relatedProducts = relatedPage.products
    .filter((item) => item.id !== product.id)
    .slice(0, 4)

  return (
    <main className="min-h-screen bg-slate-50 pb-20 pt-[74px] lg:pb-0">
      <Header />
      <AccessoryDetailClient
        product={product}
        initialVariantId={initialVariantId}
        selectedVehicle={selectedVehicle}
        relatedProducts={relatedProducts}
      />
      <Footer />
    </main>
  )
}
