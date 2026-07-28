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

type FacetValue = {
  value: string
  label: string
  order: number
}

function uniqueFacetValues(values: FacetValue[]): FacetValue[] {
  return [...new Map(values.map((value) => [value.value, value])).values()]
    .sort((left, right) => (
      left.order - right.order
      || left.label.localeCompare(right.label, 'vi-VN')
    ))
}

function categoryFacetValues(product: CatalogProduct): FacetValue[] {
  return uniqueFacetValues(product.collectionMemberships.flatMap(({ collection }) => (
    collection.kind === 'CATEGORY'
      ? [{
          value: collection.name,
          label: collection.name,
          order: collection.displayOrder,
        }]
      : []
  )))
}

function vehicleFacetValues(product: CatalogProduct): FacetValue[] {
  return uniqueFacetValues(product.collectionMemberships.flatMap(({ collection }) => {
    if (collection.kind !== 'MODEL' || !collection.vehicleModel) return []
    return [{
      value: collection.vehicleModel.name,
      label: collection.vehicleModel.name,
      order: collection.displayOrder,
    }]
  }))
}

export function accessoryCategoryLabels(product: CatalogProduct): string[] {
  return categoryFacetValues(product).map((category) => category.label)
}

export function accessoryVehicleLabels(product: CatalogProduct): string[] {
  return vehicleFacetValues(product).map((vehicle) => vehicle.label)
}

export function accessoryPrimaryCategoryLabel(
  product: CatalogProduct,
): string | null {
  const primary = product.collectionMemberships.find(({ isPrimary, collection }) => (
    isPrimary && collection.kind === 'CATEGORY'
  ))
  return primary?.collection.name ?? accessoryCategoryLabels(product)[0] ?? null
}

function matchesFacetValue(
  value: string,
  facet: FacetValue,
  aliases: string[] = [],
): boolean {
  return [facet.value, facet.label, ...aliases].some((candidate) => same(candidate, value))
}

function matchesQuery(product: CatalogProduct, query: string): boolean {
  if (!query) return true
  const collectionTerms = product.collectionMemberships.flatMap(({ collection }) => [
    collection.name,
    collection.slug,
    collection.sourceKey,
    collection.vehicleModel?.name ?? '',
    collection.vehicleModel?.code ?? '',
    collection.vehicleModel?.slug ?? '',
  ])
  const haystack = [
    product.name,
    product.description ?? '',
    ...collectionTerms,
    ...product.content.serviceLabels,
    ...product.variants.map((variant) => variant.sku),
  ].join(' ')
  return normalized(haystack).includes(normalized(query))
}

function matchesCategory(product: CatalogProduct, category: string): boolean {
  return product.collectionMemberships.some(({ collection }) => (
    collection.kind === 'CATEGORY'
    && matchesFacetValue(category, {
      value: collection.name,
      label: collection.name,
      order: collection.displayOrder,
    }, [collection.slug, collection.sourceKey])
  ))
}

function matchesVehicle(product: CatalogProduct, vehicle: string): boolean {
  return product.collectionMemberships.some(({ collection }) => {
    if (collection.kind !== 'MODEL' || !collection.vehicleModel) return false
    const facet = {
      value: collection.vehicleModel.slug,
      label: collection.vehicleModel.name,
      order: collection.displayOrder,
    }
    return matchesFacetValue(vehicle, facet, [collection.vehicleModel.code, collection.slug])
  })
}

export function filterAccessoryProducts(
  products: CatalogProduct[],
  filters: AccessoryCatalogFilters,
): CatalogProduct[] {
  const vehicleFilterApplicable = !filters.category || products.some((product) => (
    matchesCategory(product, filters.category!)
    && vehicleFacetValues(product).length > 0
  ))
  const filtered = products.filter((product) => {
    if (!matchesQuery(product, filters.query)) return false

    if (filters.category) {
      if (!matchesCategory(product, filters.category)) return false
    }

    if (filters.vehicle && vehicleFilterApplicable
      && !matchesVehicle(product, filters.vehicle)) return false

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

function countFacetValues(values: FacetValue[]): AccessoryCatalogFacetOption[] {
  const counts = new Map<string, FacetValue & { count: number }>()
  for (const value of values) {
    const key = normalized(value.value)
    const current = counts.get(key)
    counts.set(key, current
      ? { ...current, count: current.count + 1 }
      : { ...value, count: 1 })
  }
  return [...counts.values()]
    .sort((left, right) => (
      left.order - right.order
      || left.label.localeCompare(right.label, 'vi-VN')
    ))
    .map(({ value, label, count }) => ({ value, label, count }))
}

export function buildAccessoryFacets(
  products: CatalogProduct[],
): AccessoryCatalogFacets {
  const prices = products.flatMap((product) => {
    const value = productPrice(product)
    return value === null ? [] : [value]
  })

  return {
    categories: countFacetValues(products.flatMap(categoryFacetValues)),
    vehicles: countFacetValues(products.flatMap(vehicleFacetValues)),
    vehicleRelevantCategories: [...new Set(products
      .filter((product) => vehicleFacetValues(product).length > 0)
      .flatMap(categoryFacetValues)
      .map((category) => category.value))],
    services: countFacetValues(products.flatMap((product) => (
      [...new Set(product.content.serviceLabels)].map((value) => ({
        value,
        label: value,
        order: Number.MAX_SAFE_INTEGER,
      }))
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
  if (vehicleFacetValues(product).length === 0) return 'unknown'
  return matchesVehicle(product, vehicle)
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
