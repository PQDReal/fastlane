import { NextResponse } from 'next/server'

import {
  normalizeSearchQuery,
  productSearchCacheKey,
} from '@/lib/cache-keys'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  matchesProductSearch,
  toNamePrefixTsQuery,
} from '@/lib/catalog/search'
import { listMotorbikeCatalog } from '@/lib/motorbike-catalog'
import { readRedisJson, writeRedisJson } from '@/lib/redis'

const PRODUCT_SEARCH_TTL_SECONDS = 120

function searchResponse(results: unknown[], cacheStatus: 'HIT' | 'MISS') {
  return NextResponse.json(results, {
    headers: {
      'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
      'X-Fastlane-Cache': cacheStatus,
    },
  })
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')
  const cacheKey = productSearchCacheKey(query)
  const cachedResults = await readRedisJson<unknown[]>(cacheKey)
  if (cachedResults) return searchResponse(cachedResults, 'HIT')

  const supabase = getSupabaseAdmin()

  let dbQuery = supabase
    .from('products')
    .select(`
      *,
      categories (
        name
      )
    `)
    .eq('is_active', true)
    .not('product_type', 'in', '(BIKE,MOTORBIKE)')
    .order('created_at', { ascending: false })

  const tsQuery = toNamePrefixTsQuery(query)
  if (tsQuery) dbQuery = dbQuery.textSearch('search_vector', tsQuery, { config: 'simple' })

  const [{ data, error }, motorbikes] = await Promise.all([
    dbQuery,
    listMotorbikeCatalog(),
  ])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const productResults = data.map((item) => ({
      ...item,
      category: item.categories?.name || 'Chưa phân loại',
    }))
  const normalizedQuery = normalizeSearchQuery(query)
  const motorbikeResults = motorbikes
    .filter((motorbike) => matchesProductSearch(motorbike.name, normalizedQuery))
    .map((motorbike) => ({
      id: motorbike.productId,
      name: motorbike.name,
      slug: motorbike.slug,
      product_type: 'BIKE',
      displayed_price: motorbike.displayedPrice,
      specifications: motorbike.specifications,
      image_urls: [motorbike.listingImageUrl],
      category: 'Xe máy điện',
    }))

  const results = [...productResults, ...motorbikeResults]
  await writeRedisJson(cacheKey, results, PRODUCT_SEARCH_TTL_SECONDS)
  return searchResponse(results, 'MISS')
}
