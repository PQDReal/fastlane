import 'server-only'

import { normalizeProductSearchText } from '@/lib/catalog/search'
import { listAccessoryCatalog } from '@/lib/catalog/server'
import type { CatalogProduct } from '@/lib/catalog/types'
import { salesAgentProductUrl } from '../navigation/paths'

export type SalesAgentAccessoryAssociation = 'CATALOG_ASSOCIATION' | 'NOT_APPLICABLE' | 'UNKNOWN'

export type SalesAgentAccessoryDiscovery = {
  productId: string
  name: string
  slug: string
  url: string
  isActive: true
  description: string | null
  price: number | null
  facts: Record<string, string>
  associationStatus: SalesAgentAccessoryAssociation
  associationSource: string | null
  dataAsOf: string
  sourceUpdatedAt: string | null
}

export type DiscoverAccessoriesInput = {
  query?: string
  vehicleProductId?: string
  minPrice?: number
  maxPrice?: number
  limit?: number
}

export type DiscoverAccessoriesResult = {
  items: SalesAgentAccessoryDiscovery[]
  warnings: Array<{ code: string; message: string }>
}

function terms(value: string) {
  return normalizeProductSearchText(value)
    .split(' ')
    .filter((term) => term.length > 1 || /^\d+$/.test(term))
}

function associationFor(product: CatalogProduct, hasVehicleProduct: boolean) {
  const memberships = product.collectionMemberships
  if (!memberships.length) return { status: 'UNKNOWN' as const, source: null }
  const notApplicable = memberships.find((membership) => membership.collection.vehicleFilterMode === 'NONE')
  if (notApplicable) return { status: 'NOT_APPLICABLE' as const, source: notApplicable.sourceSystem }
  // Catalog collections are useful discovery evidence, but there is still no
  // audited vehicle-product FK proving technical fitment.
  return {
    status: hasVehicleProduct ? 'UNKNOWN' as const : 'CATALOG_ASSOCIATION' as const,
    source: memberships[0]?.sourceSystem ?? null,
  }
}

function compactFacts(product: CatalogProduct) {
  const facts: Record<string, string> = {}
  if (product.category?.name) facts.category = product.category.name
  if (product.serviceLabels.length) facts.services = product.serviceLabels.map((label) => label.name).join(', ')
  for (const section of product.content.sections.slice(0, 4)) {
    const content = [
      section.body,
      ...section.items.slice(0, 5),
      ...section.attributes.slice(0, 8).map((attribute) => `${attribute.label}: ${attribute.value}`),
    ].filter((value): value is string => Boolean(value)).join(' · ').slice(0, 500)
    if (content) facts[`content.${section.key}`] = `${section.title}: ${content}`
  }
  for (const group of product.optionGroups.slice(0, 4)) {
    const values = group.values.slice(0, 8).map((value) => value.name).join(', ')
    if (values) facts[`options.${group.code}`] = `${group.name}: ${values}`
  }
  return facts
}

function toDiscovery(product: CatalogProduct, dataAsOf: string, input: DiscoverAccessoriesInput): SalesAgentAccessoryDiscovery {
  const association = associationFor(product, Boolean(input.vehicleProductId))
  return {
    productId: product.id,
    name: product.name,
    slug: product.slug,
    url: salesAgentProductUrl('ACCESSORY', product.slug),
    isActive: true,
    description: product.description,
    price: product.priceRange?.minimum ?? product.displayedPrice,
    facts: compactFacts(product),
    associationStatus: association.status,
    associationSource: association.source,
    dataAsOf,
    sourceUpdatedAt: [product.createdAt, ...product.collectionMemberships.map((membership) => membership.lastSeenAt)]
      .filter((item): item is string => Boolean(item)).sort().at(-1) ?? null,
  }
}

async function listAllActiveAccessoryProducts() {
  const firstPage = await listAccessoryCatalog({ page: 1, pageSize: 100 })
  if (firstPage.totalPages <= 1) return firstPage.products
  const remainingPages = await Promise.all(Array.from(
    { length: firstPage.totalPages - 1 },
    (_, index) => listAccessoryCatalog({ page: index + 2, pageSize: 100 }),
  ))
  return [firstPage, ...remainingPages].flatMap((page) => page.products)
}

export async function discoverSalesAgentAccessories(input: DiscoverAccessoriesInput): Promise<DiscoverAccessoriesResult> {
  const dataAsOf = new Date().toISOString()
  // Reuse the same active catalog repository and mapper as the public
  // accessories UI. The agent never calls the frontend HTTP API internally.
  const products = await listAllActiveAccessoryProducts()
  const queryTerms = terms(input.query ?? '')
  const ranked = products
    .map((product) => {
      const item = toDiscovery(product, dataAsOf, input)
      const haystack = normalizeProductSearchText(`${item.name} ${item.slug} ${item.description ?? ''} ${Object.values(item.facts).join(' ')}`)
      const queryScore = queryTerms.filter((term) => haystack.includes(term)).length
      return { item, queryScore }
    })
    .filter(({ item }) => {
      if (input.minPrice !== undefined && (item.price === null || item.price < input.minPrice)) return false
      if (input.maxPrice !== undefined && (item.price === null || item.price > input.maxPrice)) return false
      return true
    })
    .sort((left, right) => right.queryScore - left.queryScore || (left.item.price ?? Number.MAX_SAFE_INTEGER) - (right.item.price ?? Number.MAX_SAFE_INTEGER))
  const matched = queryTerms.length ? ranked.filter(({ queryScore }) => queryScore > 0) : ranked
  const usedFallback = queryTerms.length > 0 && matched.length === 0 && ranked.length > 0
  const items = (usedFallback ? ranked : matched)
    .slice(0, Math.min(20, Math.max(1, input.limit ?? 8)))
    .map(({ item }) => item)

  return {
    items,
    warnings: [
      ...(input.vehicleProductId
        ? [{ code: 'VEHICLE_MODEL_MAPPING_MISSING', message: 'Catalog hiện chưa có mapping product xe → vehicle model; kết quả là gợi ý catalog và chưa xác nhận tương thích kỹ thuật.' }]
        : []),
      ...(usedFallback
        ? [{ code: 'NO_EXACT_ACCESSORY_MATCH', message: 'Không có phụ kiện khớp trực tiếp từ khóa; trả về các sản phẩm đang bán gần nhất để tham khảo.' }]
        : []),
    ],
  }
}
