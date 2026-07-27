import type {
  AccessoryCatalogFacetOption,
  AccessoryCatalogFacets,
  AccessoryCatalogFilters,
  AccessoryCatalogSort,
  AccessoryStockFilter,
  CatalogProduct,
} from '@/lib/catalog/types'

export type AccessorySearchParams = Record<
  string,
  string | string[] | undefined
>

const SORT_VALUES = new Set<AccessoryCatalogSort>([
  'name-asc',
  'price-asc',
  'price-desc',
])

const STOCK_VALUES = new Set<AccessoryStockFilter>([
  'all',
  'in-stock',
  'out-of-stock',
])

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

function nullable(value: string | string[] | undefined): string | null {
  return first(value) || null
}

function price(value: string | string[] | undefined): number | null {
  const raw = first(value)
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export function parseAccessoryFilters(
  searchParams: AccessorySearchParams | undefined,
): AccessoryCatalogFilters {
  const sort = first(searchParams?.sort) as AccessoryCatalogSort
  const stock = first(searchParams?.stock) as AccessoryStockFilter
  const minimumPrice = price(searchParams?.minPrice)
  const maximumPrice = price(searchParams?.maxPrice)

  return {
    query: first(searchParams?.q).slice(0, 120),
    category: nullable(searchParams?.category),
    vehicle: nullable(searchParams?.vehicle),
    service: nullable(searchParams?.service),
    stock: STOCK_VALUES.has(stock) ? stock : 'all',
    minimumPrice,
    maximumPrice: maximumPrice !== null
      && minimumPrice !== null
      && maximumPrice < minimumPrice
      ? minimumPrice
      : maximumPrice,
    sort: SORT_VALUES.has(sort) ? sort : 'name-asc',
  }
}

export function parseAccessoryPage(
  searchParams: AccessorySearchParams | undefined,
): number {
  const parsed = Number.parseInt(first(searchParams?.page), 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

function normalized(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi-VN')
}

function same(left: string, right: string): boolean {
  return normalized(left) === normalized(right)
}

function productPrice(product: CatalogProduct): number | null {
  return product.priceRange?.minimum ?? product.displayedPrice
}

function matchesQuery(product: CatalogProduct, query: string): boolean {
  if (!query) return true
  const haystack = [
    product.name,
    product.description ?? '',
    product.content.sourceCategory ?? '',
    ...product.content.categories,
    ...product.content.compatibleModels,
    ...product.variants.map((variant) => variant.sku),
  ].join(' ')
  return normalized(haystack).includes(normalized(query))
}

export function filterAccessoryProducts(
  products: CatalogProduct[],
  filters: AccessoryCatalogFilters,
): CatalogProduct[] {
  const filtered = products.filter((product) => {
    if (!matchesQuery(product, filters.query)) return false

    if (filters.category) {
      const categories = [
        product.content.sourceCategory,
        ...product.content.categories,
      ].filter((value): value is string => Boolean(value))
      if (!categories.some((value) => same(value, filters.category!))) return false
    }

    if (filters.vehicle && !product.content.compatibleModels.some(
      (value) => same(value, filters.vehicle!),
    )) return false

    if (filters.service && !product.content.serviceLabels.some(
      (value) => same(value, filters.service!),
    )) return false

    if (filters.stock === 'in-stock' && product.availableQuantity <= 0) return false
    if (filters.stock === 'out-of-stock' && product.availableQuantity > 0) return false

    const currentPrice = productPrice(product)
    if (filters.minimumPrice !== null
      && (currentPrice === null || currentPrice < filters.minimumPrice)) return false
    if (filters.maximumPrice !== null
      && (currentPrice === null || currentPrice > filters.maximumPrice)) return false
    return true
  })

  return filtered.sort((left, right) => {
    if (filters.sort === 'price-asc' || filters.sort === 'price-desc') {
      const leftPrice = productPrice(left)
      const rightPrice = productPrice(right)
      if (leftPrice === null && rightPrice !== null) return 1
      if (leftPrice !== null && rightPrice === null) return -1
      if (leftPrice === null || rightPrice === null) {
        return left.name.localeCompare(right.name, 'vi-VN')
      }
      const difference = leftPrice - rightPrice
      if (difference !== 0) {
        return filters.sort === 'price-desc' ? -difference : difference
      }
    }
    return left.name.localeCompare(right.name, 'vi-VN')
  })
}

function countValues(values: string[]): AccessoryCatalogFacetOption[] {
  const counts = new Map<string, { value: string; count: number }>()
  for (const value of values) {
    const key = normalized(value)
    const current = counts.get(key)
    counts.set(key, current
      ? { ...current, count: current.count + 1 }
      : { value, count: 1 })
  }
  return [...counts.values()].sort((left, right) => (
    left.value.localeCompare(right.value, 'vi-VN')
  ))
}

export function buildAccessoryFacets(
  products: CatalogProduct[],
): AccessoryCatalogFacets {
  const prices = products.flatMap((product) => {
    const value = productPrice(product)
    return value === null ? [] : [value]
  })

  return {
    categories: countValues(products.flatMap((product) => (
      product.content.sourceCategory
        ? [product.content.sourceCategory]
        : product.content.categories.slice(0, 1)
    ))),
    vehicles: countValues(products.flatMap((product) => (
      [...new Set(product.content.compatibleModels)]
    ))),
    services: countValues(products.flatMap((product) => (
      [...new Set(product.content.serviceLabels)]
    ))),
    minimumPrice: prices.length > 0 ? Math.min(...prices) : null,
    maximumPrice: prices.length > 0 ? Math.max(...prices) : null,
    total: products.length,
  }
}

export type AccessoryFitmentStatus =
  | 'not-selected'
  | 'compatible'
  | 'incompatible'
  | 'unknown'

export function accessoryFitmentStatus(
  product: CatalogProduct,
  vehicle: string | null | undefined,
): AccessoryFitmentStatus {
  if (!vehicle) return 'not-selected'
  if (product.content.compatibleModels.length === 0) return 'unknown'
  return product.content.compatibleModels.some((model) => same(model, vehicle))
    ? 'compatible'
    : 'incompatible'
}

export function accessorySearchParams(
  filters: AccessoryCatalogFilters,
): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.query) params.set('q', filters.query)
  if (filters.category) params.set('category', filters.category)
  if (filters.vehicle) params.set('vehicle', filters.vehicle)
  if (filters.service) params.set('service', filters.service)
  if (filters.stock !== 'all') params.set('stock', filters.stock)
  if (filters.minimumPrice !== null) params.set('minPrice', String(filters.minimumPrice))
  if (filters.maximumPrice !== null) params.set('maxPrice', String(filters.maximumPrice))
  if (filters.sort !== 'name-asc') params.set('sort', filters.sort)
  return params
}

export function accessoryCatalogHref(
  filters: AccessoryCatalogFilters,
  changes: Record<string, string | number | null | undefined> = {},
): string {
  const params = accessorySearchParams(filters)
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === undefined || value === '') params.delete(key)
    else params.set(key, String(value))
  }
  const query = params.toString()
  return query ? `/accessories?${query}` : '/accessories'
}
