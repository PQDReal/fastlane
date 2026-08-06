import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { listMotorbikeCatalog } from '@/lib/motorbike-catalog'
import { matchesProductSearch, normalizeProductSearchText, toNamePrefixTsQuery } from '@/lib/catalog/search'
import type { AssistantFilters, AssistantProduct } from './types'
import { readRedisJson, writeRedisJson } from '@/lib/redis'
import { createHash } from 'node:crypto'

const PUBLIC_FACT_KEY = /(distance|range|maxpower|max power|powertrain|battery|capacity|topspeed|top speed|speed|quang duong|pham vi|cong suat|toc do|pin)/i

function collectPublicFacts(value: unknown, path = '', result: Record<string, string> = {}) {
  if (Object.keys(result).length >= 30 || value == null) return result
  if (Array.isArray(value)) {
    value.slice(0, 10).forEach((item, index) => collectPublicFacts(item, `${path}[${index}]`, result))
    return result
  }
  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
      const childPath = path ? `${path}.${key}` : key
      if (child && typeof child === 'object') collectPublicFacts(child, childPath, result)
      else if (PUBLIC_FACT_KEY.test(normalizeProductSearchText(childPath)) && (typeof child === 'string' || typeof child === 'number')) {
        const normalized = String(child).replace(/<br\s*\/?\s*>/gi, '; ').trim()
        if (normalized) result[childPath] = normalized.slice(0, 300)
      }
    })
  }
  return result
}

export async function retrieveCatalogProducts(query: string, filters: AssistantFilters, limit = 8): Promise<AssistantProduct[]> {
  const cacheFingerprint = createHash('sha256').update(JSON.stringify({ query, filters, limit })).digest('hex')
  const cacheKey = `fastlane:assistant-search:v1:${cacheFingerprint}`
  const cached = await readRedisJson<AssistantProduct[]>(cacheKey)
  if (cached) return cached
  const supabase = getSupabaseAdmin()
  let request = supabase.from('products').select('id,name,slug,displayed_price,image_urls,specifications,product_type,categories(name)').eq('is_active', true).limit(limit * 3)
  if (filters.productType === 'accessory') request = request.eq('product_type', 'ACCESSORY')
  if (filters.productType === 'car') request = request.eq('product_type', 'CAR')
  if (filters.maxPrice != null) request = request.lte('displayed_price', filters.maxPrice)
  if (filters.minPrice != null) request = request.gte('displayed_price', filters.minPrice)
  const tsQuery = toNamePrefixTsQuery(query)
  if (tsQuery) request = request.textSearch('search_vector', tsQuery, { config: 'simple' })
  const productRequest = filters.productType === 'motorbike'
    ? Promise.resolve({ data: [], error: null })
    : request
  const [{ data, error }, motorbikes] = await Promise.all([productRequest, listMotorbikeCatalog()])
  if (error) throw new Error(error.message)
  const products: AssistantProduct[] = (data ?? []).map((item: any) => ({
    id: item.id, name: item.name, slug: item.slug, category: item.categories?.name ?? 'Chưa phân loại',
    displayed_price: item.displayed_price ?? null, image_urls: Array.isArray(item.image_urls) ? item.image_urls.filter(Boolean).slice(0, 1) : [],
    facts: collectPublicFacts(item.specifications),
  }))
  const motorbikeProducts: AssistantProduct[] = motorbikes
    .filter((item) => filters.productType !== 'car' && filters.productType !== 'accessory')
    .filter((item) => !query || matchesProductSearch(item.name, query))
    .filter((item) => filters.maxPrice == null || item.displayedPrice <= filters.maxPrice)
    .filter((item) => filters.minPrice == null || item.displayedPrice >= filters.minPrice)
    .map((item) => ({ id: item.productId, name: item.name, slug: item.slug, category: 'Xe máy điện', displayed_price: item.displayedPrice, image_urls: item.listingImageUrl ? [item.listingImageUrl] : [], facts: collectPublicFacts(item.specifications) }))
  const matchingProducts = [...products, ...motorbikeProducts].filter((item) => {
    if (query && !matchesProductSearch(item.name, query)) return false
    const price = item.displayed_price
    return (filters.maxPrice == null || price == null || price <= filters.maxPrice) && (filters.minPrice == null || price == null || price >= filters.minPrice)
  })
  const uniqueProducts = new Map<string, AssistantProduct>()
  matchingProducts.forEach((item) => {
    const key = item.id || `${item.category}:${item.slug}`
    uniqueProducts.set(key, item)
  })
  const orderedProducts = [...uniqueProducts.values()]
  if (filters.sort === 'price_asc') orderedProducts.sort((left, right) => (left.displayed_price ?? Number.POSITIVE_INFINITY) - (right.displayed_price ?? Number.POSITIVE_INFINITY))
  if (filters.sort === 'price_desc') orderedProducts.sort((left, right) => (right.displayed_price ?? 0) - (left.displayed_price ?? 0))
  const result = orderedProducts.slice(0, limit)
  await writeRedisJson(cacheKey, result, 60)
  return result
}
