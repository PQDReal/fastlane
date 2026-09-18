import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { listMotorbikeCatalog } from '@/lib/motorbike-catalog'
import { matchesProductSearch, normalizeProductSearchText, toNamePrefixTsQuery } from '@/lib/catalog/search'
import type { AssistantFilters, AssistantProduct } from './types'
import { readRedisJson, writeRedisJson } from '@/lib/redis'
import { createHash } from 'node:crypto'

const PUBLIC_FACT_KEY = /(distance|range|maxpower|max power|powertrain|battery|capacity|topspeed|top speed|speed|quang duong|pham vi|cong suat|toc do|pin)/i

// Giai đoạn 1: Chọn một tập thông số công khai nhỏ để trả lời FAQ.
// Không đưa toàn bộ specifications ra response; giới hạn số lượng và độ dài
// giúp tránh payload lớn cũng như tránh vô tình lộ dữ liệu nội bộ của catalog.
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
  // Giai đoạn 2: Tạo khóa cache ổn định từ toàn bộ đầu vào có thể ảnh hưởng
  // kết quả. Không được chỉ cache theo query vì cùng một tên xe có thể đi kèm
  // loại sản phẩm, ngân sách, hướng sắp xếp hoặc limit khác nhau.
  const cacheFingerprint = createHash('sha256').update(JSON.stringify({ query, filters, limit })).digest('hex')
  const cacheKey = `fastlane:assistant-search:v4:${cacheFingerprint}`
  const cached = await readRedisJson<AssistantProduct[]>(cacheKey)
  if (cached) return cached
  const supabase = getSupabaseAdmin()
  // Giai đoạn 3: Lấy dữ liệu nền từ Supabase với giới hạn phù hợp.
  // Query xếp hạng phải quét toàn bộ catalog đang hoạt động; nếu chỉ lấy trang
  // đầu tùy ý của database thì sản phẩm rẻ nhất/đắt nhất có thể bị bỏ sót.
  // Query thông thường vẫn bị giới hạn để giữ độ trễ thấp.
  // Đọc catalog đang hoạt động thay vì danh sách cứng các mẫu xe. Query xếp
  // hạng phải thấy mọi ứng viên; yêu cầu rộng (ví dụ
  // “xe máy điện”) không có từ khóa tên để giới hạn ở database. Mức 1.000
  // hiện bao phủ catalog và vẫn giữ endpoint trong giới hạn an toàn.
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

  // Giai đoạn 4: Chuẩn hóa hai nguồn dữ liệu về cùng AssistantProduct.
  // Ô tô/phụ kiện đọc trực tiếp từ products; xe máy điện có catalog riêng để
  // hỗ trợ cache metadata và vehicle variant. Các bước sau chỉ làm việc trên
  // kiểu dữ liệu chung, không cần biết sản phẩm đến từ nguồn nào.
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

  // Giai đoạn 5: Lọc lại sau khi hợp nhất hai nguồn.
  // Database đã lọc loại sản phẩm và giá cho products; xe máy điện cần lọc bổ
  // sung ở đây. Sau đó áp dụng cùng rule cho tên, màu và giới tính để hai
  // nguồn có cùng semantics trước khi sắp xếp.
  const matchingProducts = [...products, ...motorbikeProducts].filter((item) => {
    if (query && !matchesProductSearch(item.name, query)) return false
    const price = item.displayed_price
    const searchable = item.searchableText ?? normalizeProductSearchText(item.name)
    if (filters.color && !searchable.includes(filters.color)) return false
    if (filters.gender && !searchable.includes(filters.gender)) return false
    return (filters.maxPrice == null || price == null || price <= filters.maxPrice) && (filters.minPrice == null || price == null || price >= filters.minPrice)
  })
  const uniqueProducts = new Map<string, AssistantProduct>()
  // Khử trùng lặp theo id để một sản phẩm không xuất hiện hai lần khi các
  // nguồn có nhiều bản ghi liên quan. category/slug là fallback cho dữ liệu cũ
  // chưa có id ổn định.
  matchingProducts.forEach((item) => {
    const key = item.id || `${item.category}:${item.slug}`
    uniqueProducts.set(key, item)
  })
  const orderedProducts = [...uniqueProducts.values()]
  // Giai đoạn 6: Lấy metric từ facts cho yêu cầu xếp hạng kỹ thuật.
  // Sản phẩm thiếu metric bị loại khỏi bảng xếp hạng; không tự gán 0 vì sẽ làm
  // kết quả sai lệch theo hướng ưu tiên những sản phẩm thiếu dữ liệu.
  const metric = (item: AssistantProduct, kind: NonNullable<AssistantFilters['sortBy']>) => {
    if (kind === 'price') return item.displayed_price ?? null
    const patterns = kind === 'top_speed' ? /(top.?speed|speed|toc.?do)/i : kind === 'range' ? /(distance|range|quang.?duong|pham.?vi)/i : kind === 'power' ? /(max.?power|power|cong.?suat)/i : /(battery|capacity|dung.?luong|pin)/i
    const entry = Object.entries(item.facts ?? {}).find(([key]) => patterns.test(normalizeProductSearchText(key)))
    const match = entry?.[1].match(/[0-9]+(?:[.,][0-9]+)?/)
    return match ? Number(match[0].replace(',', '.')) : null
  }
  if (filters.sortBy) {
    // null bị loại khỏi danh sách xếp hạng; direction chỉ quyết định tăng hoặc
    // giảm. Nhờ vậy thứ tự vẫn ổn định khi catalog thiếu thông số kỹ thuật.
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
  // Giai đoạn 7: Cắt kết quả sau mọi filter và sort, rồi cache đúng projection
  // cuối cùng. Lần gọi sau không phải lặp lại việc hợp nhất và xếp hạng.
  const result = orderedProducts.slice(0, limit)
  await writeRedisJson(cacheKey, result, 60)
  return result
}
