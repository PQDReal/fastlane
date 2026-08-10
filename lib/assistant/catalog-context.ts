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
  const cacheKey = `fastlane:assistant-search:v4:${cacheFingerprint}`
  const cached = await readRedisJson<AssistantProduct[]>(cacheKey)
  if (cached) return cached
  const supabase = getSupabaseAdmin()
  // Ranking queries must inspect the complete active catalog, otherwise the
  // database's arbitrary first page can hide the true cheapest/most expensive
  // product. Normal searches keep the smaller limit for latency.
  // Read the active catalog rather than a fixed list of known model names.
  // Ranking must see every candidate, and a broad request (for example
  // “xe máy điện”) has no product-name token to constrain at the database
  // level. Supabase returns at most 1,000 rows per request, which covers the
  // current catalog while remaining bounded for the assistant endpoint.
  const sourceLimit = filters.sortBy ? 1000 : Math.max(1000, limit * 3)
  let request = supabase.from('products').select('id,name,slug,displayed_price,image_urls,specifications,product_type,categories(name)').eq('is_active', true).limit(sourceLimit)
  if (filters.productType === 'accessory') request = request.eq('product_type', 'ACCESSORY')
  if (filters.productType === 'car') request = request.eq('product_type', 'CAR')
  if (filters.productType === 'motorbike') request = request.in('product_type', ['BIKE', 'MOTORBIKE'])
  if (!filters.productType) request = request.not('product_type', 'in', '(BIKE,MOTORBIKE)')
  if (filters.maxPrice != null) request = request.lte('displayed_price', filters.maxPrice)
  if (filters.minPrice != null) request = request.gte('displayed_price', filters.minPrice)
  const tsQuery = toNamePrefixTsQuery(query)
  if (tsQuery) request = request.textSearch('search_vector', tsQuery, { config: 'simple' })
  const [{ data, error }, motorbikes] = await Promise.all([request, listMotorbikeCatalog()])
  if (error) throw new Error(error.message)
  const products: AssistantProduct[] = (data ?? []).map((item: any) => ({
    id: item.id, name: item.name, slug: item.slug, product_type: item.product_type, category: item.categories?.name ?? 'Chưa phân loại',
    displayed_price: item.displayed_price ?? null, image_urls: Array.isArray(item.image_urls) ? item.image_urls.filter(Boolean).slice(0, 1) : [],
    facts: collectPublicFacts(item.specifications), searchableText: normalizeProductSearchText(`${item.name} ${JSON.stringify(item.specifications ?? {})}`),
  }))
  const motorbikeProducts: AssistantProduct[] = motorbikes
    .filter((item) => filters.productType !== 'car' && filters.productType !== 'accessory')
    .filter((item) => !query || matchesProductSearch(item.name, query))
    .filter((item) => filters.maxPrice == null || item.displayedPrice <= filters.maxPrice)
    .filter((item) => filters.minPrice == null || item.displayedPrice >= filters.minPrice)
    .map((item) => ({ id: item.productId, name: item.name, slug: item.slug, product_type: 'MOTORBIKE' as const, category: 'Xe máy điện', displayed_price: item.displayedPrice, image_urls: item.listingImageUrl ? [item.listingImageUrl] : [], facts: collectPublicFacts(item.specifications), searchableText: normalizeProductSearchText(`${item.name} ${JSON.stringify(item.specifications ?? {})}`) }))
  const matchingProducts = [...products, ...motorbikeProducts].filter((item) => {
    if (query && !matchesProductSearch(item.name, query)) return false
    const price = item.displayed_price
    const searchable = item.searchableText ?? normalizeProductSearchText(item.name)
    if (filters.color && !searchable.includes(filters.color)) return false
    if (filters.gender && !searchable.includes(filters.gender)) return false
    return (filters.maxPrice == null || price == null || price <= filters.maxPrice) && (filters.minPrice == null || price == null || price >= filters.minPrice)
  })
  const uniqueProducts = new Map<string, AssistantProduct>()
  matchingProducts.forEach((item) => {
    const key = item.id || `${item.category}:${item.slug}`
    uniqueProducts.set(key, item)
  })
  const orderedProducts = [...uniqueProducts.values()]
  const metric = (item: AssistantProduct, kind: NonNullable<AssistantFilters['sortBy']>) => {
    if (kind === 'price') return item.displayed_price ?? null
    const patterns = kind === 'top_speed' ? /(top.?speed|speed|toc.?do)/i : kind === 'range' ? /(distance|range|quang.?duong|pham.?vi)/i : kind === 'power' ? /(max.?power|power|cong.?suat)/i : /(battery|capacity|dung.?luong|pin)/i
    const entry = Object.entries(item.facts ?? {}).find(([key]) => patterns.test(normalizeProductSearchText(key)))
    const match = entry?.[1].match(/[0-9]+(?:[.,][0-9]+)?/)
    return match ? Number(match[0].replace(',', '.')) : null
  }
  if (filters.sortBy) {
    const direction = filters.sortDirection === 'asc' ? 1 : -1
    const withMetric = orderedProducts.filter((item) => metric(item, filters.sortBy!) != null)
    orderedProducts.splice(0, orderedProducts.length, ...withMetric)
    orderedProducts.sort((left, right) => {
      const a = metric(left, filters.sortBy!)
      const b = metric(right, filters.sortBy!)
      if (a == null && b == null) return 0
      if (a == null) return 1
      if (b == null) return -1
      return (a - b) * direction
    })
  }
  if (filters.sort === 'price_asc') orderedProducts.sort((left, right) => (left.displayed_price ?? Number.POSITIVE_INFINITY) - (right.displayed_price ?? Number.POSITIVE_INFINITY))
  if (filters.sort === 'price_desc') orderedProducts.sort((left, right) => (right.displayed_price ?? 0) - (left.displayed_price ?? 0))
  const result = orderedProducts.slice(0, limit)
  await writeRedisJson(cacheKey, result, 60)
  return result
}
