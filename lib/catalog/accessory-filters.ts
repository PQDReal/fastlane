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
])

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

function nullable(value: string | string[] | undefined): string | null {
  return first(value) || null
}

function selectedValues(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : []
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))].slice(0, 20)
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
    services: selectedValues(searchParams?.service),
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

function matchesCategory(product: CatalogProduct, category: string): boolean {
  return productFacetCategories(product).some((value) => same(value, category))
}

export function filterAccessoryProducts(
  products: CatalogProduct[],
  filters: AccessoryCatalogFilters,
): CatalogProduct[] {
  const vehicleFilterApplicable = !filters.category || products.some((product) => (
    matchesCategory(product, filters.category!)
    && product.content.compatibleModels.length > 0
  ))
  const filtered = products.filter((product) => {
    if (!matchesQuery(product, filters.query)) return false

    if (filters.category) {
      if (!matchesCategory(product, filters.category)) return false
    }

    if (filters.vehicle && vehicleFilterApplicable && !product.content.compatibleModels.some(
      (value) => same(value, filters.vehicle!),
    )) return false

    if (filters.services.length > 0 && !filters.services.some(
      (selectedService) => product.content.serviceLabels.some(
        (value) => same(value, selectedService),
      ),
    )) return false

    if (filters.stock === 'in-stock' && product.availableQuantity <= 0) return false

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

function productFacetCategories(product: CatalogProduct): string[] {
  return product.content.sourceCategory
    ? [product.content.sourceCategory]
    : product.content.categories.slice(0, 1)
}

export function buildAccessoryFacets(
  products: CatalogProduct[],
): AccessoryCatalogFacets {
  const prices = products.flatMap((product) => {
    const value = productPrice(product)
    return value === null ? [] : [value]
  })

  return {
    categories: countValues(products.flatMap(productFacetCategories)),
    vehicles: countValues(products.flatMap((product) => (
      [...new Set(product.content.compatibleModels)]
    ))),
    vehicleRelevantCategories: countValues(products
      .filter((product) => product.content.compatibleModels.length > 0)
      .flatMap(productFacetCategories))
      .map((category) => category.value),
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
  for (const service of filters.services) params.append('service', service)
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
