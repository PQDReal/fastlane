import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'

import { carCatalogCacheKey } from '@/lib/cache-keys'
import { getProductImage, getCarSpecsSummary } from '@/lib/get-product-image'
import { readRedisJson, writeRedisJson } from '@/lib/redis'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export type CarCatalogItem = {
  id: string
  name: string
  slug: string
  description: string
  displayedPrice: number
  imageUrl: string
}

export type CarCatalogPage = {
  items: CarCatalogItem[]
  total: number
}

type CarRow = {
  id: string
  name: string
  slug: string
  description: string | null
  displayed_price: number | string | null
  image_urls: string[] | null
  range_text: string | null
  seat_count: string | null
}

async function loadCarCatalogPage(page: number, pageSize: number): Promise<CarCatalogPage> {
  try {
    const start = (page - 1) * pageSize
    const result = await getSupabaseAdmin()
      .from('products')
      .select('id,name,slug,description,displayed_price,image_urls,range_text:specifications->>range_text,seat_count:specifications->>seat_count,category:categories!inner(name)', { count: 'exact' })
      .eq('is_active', true)
      .eq('categories.name', 'Ô tô điện')
      .range(start, start + pageSize - 1)

    if (result.error) throw new Error(`Không thể tải danh mục ô tô: ${result.error.message}`)

    const rows = (result.data ?? []) as unknown as CarRow[]
    const items = rows
      .map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: getCarSpecsSummary({
          range_text: row.range_text,
          seat_count: row.seat_count,
        }) || row.description || 'Xe ô tô điện VinFast',
        displayedPrice: Number(row.displayed_price) || 0,
        imageUrl: getProductImage(row.name, row.image_urls),
      }))
      .sort((left, right) => {
        const leftNumber = Number.parseInt(left.name.match(/\d+/)?.[0] || '0', 10)
        const rightNumber = Number.parseInt(right.name.match(/\d+/)?.[0] || '0', 10)
        return leftNumber - rightNumber || left.name.localeCompare(right.name, 'vi')
      })

    return { items, total: result.count ?? 0 }
  } catch (error) {
    if (process.env.npm_lifecycle_event === 'build' || !process.env.NODE_ENV || process.env.NODE_ENV !== 'production') {
      console.warn('⚠️  Car catalog fetch failed during build. Returning empty catalog.', error)
      return { items: [], total: 0 }
    }
    throw error
  }
}

function nextCachedCarCatalogPage(page: number, pageSize: number) {
  return unstable_cache(
    () => loadCarCatalogPage(page, pageSize),
    ['car-catalog-v2', String(page), String(pageSize)],
    { revalidate: 300, tags: ['vehicle-catalog', 'car-catalog'] },
  )()
}

async function distributedCarCatalogPage(page: number, pageSize: number) {
  const key = carCatalogCacheKey(page, pageSize)
  const cached = await readRedisJson<CarCatalogPage>(key)
  if (cached) return cached

  const result = await nextCachedCarCatalogPage(page, pageSize)
  await writeRedisJson(key, result, 300)
  return result
}

export const listCarCatalogPage = cache(distributedCarCatalogPage)
