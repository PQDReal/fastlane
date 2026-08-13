import 'server-only'
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getProductImage } from '@/lib/get-product-image'
import { listMotorbikeCatalog } from '@/lib/motorbike-catalog'
import {
  normalizeCarSpecifications,
  normalizeMotorbikeSpecifications,
} from '@/lib/catalog/vehicle-specifications'

export type ComparableVariant = {
  id: string
  name: string
  sku: string
  originalPrice: number
  salePrice: number | null
}

export type ComparableVehicle = {
  id: string
  name: string
  slug: string
  category: string
  imageUrl: string | null
  displayedPrice: number | null
  specifications: Record<string, string>
  variants: ComparableVariant[]
}

type ProductRow = {
  id: string
  name: string
  slug: string
  image_urls: unknown
  displayed_price: number | null
  specifications: unknown
  categories: { name: string } | { name: string }[] | null
  product_variants: { id: string; name: string; sku: string; original_price: number; sale_price: number | null }[] | null
}

const COMPARABLE_CATEGORIES = new Set(['Ô tô điện', 'Xe máy điện'])
const CAR_CATEGORY = 'Ô tô điện'

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

async function loadComparableVehicles(): Promise<ComparableVehicle[]> {
  const [carResult, motorbikes] = await Promise.all([
    getSupabaseAdmin()
      .from('products')
      .select(`id,name,slug,image_urls,displayed_price,specifications,categories(name),product_variants(id,name,sku,original_price,sale_price)`)
      .eq('is_active', true)
      .in('product_type', ['CAR', 'VEHICLE'])
      .eq('product_variants.is_active', true)
      .order('name'),
    listMotorbikeCatalog(),
  ])

  if (carResult.error) throw new Error(`Không thể tải dữ liệu so sánh: ${carResult.error.message}`)

  const cars = ((carResult.data ?? []) as ProductRow[])
    .map((product) => {
      const category = Array.isArray(product.categories) ? product.categories[0] : product.categories
      const images = stringArray(product.image_urls)
      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        category: category?.name ?? '',
        imageUrl: category?.name === CAR_CATEGORY ? getProductImage(product.name, images) : images[0] ?? null,
        displayedPrice: product.displayed_price,
        specifications: category?.name === CAR_CATEGORY
          ? normalizeCarSpecifications(product.specifications)
          : normalizeMotorbikeSpecifications(product.specifications),
        variants: (product.product_variants ?? []).map((variant) => ({
          id: variant.id,
          name: variant.name,
          sku: variant.sku,
          originalPrice: variant.original_price,
          salePrice: variant.sale_price,
        })),
      }
    })
    .filter((product) => COMPARABLE_CATEGORIES.has(product.category))

  const bikes: ComparableVehicle[] = motorbikes.map((motorbike) => ({
    id: motorbike.productId,
    name: motorbike.name,
    slug: motorbike.slug,
    category: 'Xe máy điện',
    imageUrl: motorbike.listingImageUrl,
    displayedPrice: motorbike.displayedPrice,
    specifications: normalizeMotorbikeSpecifications(motorbike.specifications),
    variants: motorbike.versions.map((variant) => ({
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      originalPrice: variant.price,
      salePrice: null,
    })),
  }))

  return [...cars, ...bikes].sort((left, right) =>
    left.name.localeCompare(right.name, 'vi'),
  )
}

const loadCachedComparableVehicles = unstable_cache(
  loadComparableVehicles,
  ['comparable-vehicles-v1'],
  { revalidate: 300, tags: ['vehicle-catalog'] },
)

export const listComparableVehicles = cache(loadCachedComparableVehicles)
