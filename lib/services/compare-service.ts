import 'server-only'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

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
const HIDDEN_SPECIFICATION_KEYS = new Set(['url', 'name', 'product_type'])

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function displayValue(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    const values = value.map(displayValue).filter((item): item is string => Boolean(item))
    return values.length ? values.join(', ') : null
  }
  if (value && typeof value === 'object') {
    const values = Object.entries(value)
      .map(([key, item]) => {
        const displayed = displayValue(item)
        return displayed ? `${key}: ${displayed}` : null
      })
      .filter((item): item is string => Boolean(item))
    return values.length ? values.join('; ') : null
  }
  return null
}

function normalizeSpecifications(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !key.startsWith('_') && !HIDDEN_SPECIFICATION_KEYS.has(key))
      .map(([key, item]) => [key, displayValue(item)] as const)
      .filter((entry): entry is readonly [string, string] => entry[1] !== null),
  )
}

export async function listComparableVehicles(): Promise<ComparableVehicle[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('products')
    .select(`id,name,slug,image_urls,displayed_price,specifications,categories(name),product_variants(id,name,sku,original_price,sale_price)`)
    .eq('is_active', true)
    .eq('product_type', 'VEHICLE')
    .eq('product_variants.is_active', true)
    .order('name')

  if (error) throw new Error(`Không thể tải dữ liệu so sánh: ${error.message}`)

  return ((data ?? []) as ProductRow[])
    .map((product) => {
      const category = Array.isArray(product.categories) ? product.categories[0] : product.categories
      const images = stringArray(product.image_urls)
      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        category: category?.name ?? '',
        imageUrl: images[0] ?? null,
        displayedPrice: product.displayed_price,
        specifications: normalizeSpecifications(product.specifications),
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
}