import 'server-only'

import { normalizeProductSearchText } from '@/lib/catalog/search'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export type SalesAgentAccessoryAssociation = 'CATALOG_ASSOCIATION' | 'NOT_APPLICABLE' | 'UNKNOWN'

export type SalesAgentAccessoryDiscovery = {
  productId: string
  name: string
  slug: string
  description: string | null
  price: number | null
  availableQuantity: number | null
  availability: 'IN_STOCK' | 'OUT_OF_STOCK' | 'UNKNOWN'
  associationStatus: SalesAgentAccessoryAssociation
  associationSource: string | null
  dataAsOf: string
  sourceUpdatedAt: string | null
}

type InventoryRow = {
  on_hand_quantity: number | string
  updated_at?: string | null
}

type CollectionRow = {
  kind: 'CATEGORY' | 'MODEL' | 'CAMPAIGN' | string
  vehicle_filter_mode: 'NONE' | 'COLLECTION_MEMBERSHIP' | 'VERIFIED_FITMENT' | string
}

type CollectionMembership = {
  source_system: string
  is_active: boolean
  updated_at?: string | null
  last_seen_at?: string | null
  collection: CollectionRow | CollectionRow[] | null
}

type AccessoryRow = {
  id: string
  name: string
  slug: string
  description: string | null
  displayed_price: number | string | null
  updated_at: string | null
  product_variants: Array<{
    original_price: number | string | null
    sale_price: number | string | null
    is_active: boolean
    updated_at?: string | null
    inventory_items: InventoryRow | InventoryRow[] | null
  }>
  collection_memberships: CollectionMembership[]
}

export type DiscoverAccessoriesInput = {
  query?: string
  vehicleProductId?: string
  minPrice?: number
  maxPrice?: number
  stockFilter?: 'ALL' | 'IN_STOCK'
  limit?: number
}

export type DiscoverAccessoriesResult = {
  items: SalesAgentAccessoryDiscovery[]
  warnings: Array<{ code: string; message: string }>
}

const QUERY_STOP_WORDS = new Set(['phu', 'kien', 'cho', 'xe', 'goi', 'y', 'nen', 'mua', 'tim', 'san', 'pham', 'giup', 'toi', 'minh', 'vinfast'])

export const SALES_AGENT_ACCESSORY_READ_SELECT = `
      id,name,slug,description,displayed_price,updated_at,
      product_variants(original_price,sale_price,is_active,updated_at,inventory_items(on_hand_quantity,updated_at)),
      collection_memberships:product_collection_memberships(
        source_system,is_active,last_seen_at,
        collection:catalog_collections(kind,vehicle_filter_mode)
      )`

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function terms(value: string) {
  return normalizeProductSearchText(value)
    .split(' ')
    .filter((term) => (term.length > 1 || /^\d+$/.test(term)) && !QUERY_STOP_WORDS.has(term))
}

function effectivePrice(variant: AccessoryRow['product_variants'][number]) {
  return number(variant.sale_price) ?? number(variant.original_price)
}

function inventoryState(value: InventoryRow | InventoryRow[] | null | undefined) {
  if (Array.isArray(value)) {
    return { state: 'UNKNOWN' as const, quantity: null, updatedAt: null as string | null }
  }
  const inventory = value
  if (!inventory) return { state: 'UNKNOWN' as const, quantity: null, updatedAt: null as string | null }
  const quantity = number(inventory.on_hand_quantity)
  if (quantity === null || quantity < 0) return { state: 'UNKNOWN' as const, quantity: null, updatedAt: inventory.updated_at ?? null }
  return {
    state: quantity > 0 ? 'IN_STOCK' as const : 'OUT_OF_STOCK' as const,
    quantity,
    updatedAt: inventory.updated_at ?? null,
  }
}

function aggregateInventory(variants: AccessoryRow['product_variants']) {
  const active = variants.filter((variant) => variant.is_active !== false)
  if (!active.length) return { state: 'UNKNOWN' as const, quantity: null, updatedAt: null as string | null }
  const states = active.map((variant) => inventoryState(variant.inventory_items))
  const updatedAt = states.map((item) => item.updatedAt).filter((item): item is string => Boolean(item)).sort().at(-1) ?? null
  if (states.some((item) => item.state === 'UNKNOWN')) return { state: 'UNKNOWN' as const, quantity: null, updatedAt }
  const quantity = states.reduce((sum, item) => sum + (item.quantity ?? 0), 0)
  return { state: quantity > 0 ? 'IN_STOCK' as const : 'OUT_OF_STOCK' as const, quantity, updatedAt }
}

function activeMemberships(row: AccessoryRow) {
  return (row.collection_memberships ?? []).filter((membership) => membership.is_active !== false)
}

function associationFor(row: AccessoryRow, hasVehicleProduct: boolean) {
  const memberships = activeMemberships(row)
  if (!memberships.length) return { status: 'UNKNOWN' as const, source: null }
  const notApplicable = memberships.find((membership) => one(membership.collection)?.vehicle_filter_mode === 'NONE')
  if (notApplicable) {
    return { status: 'NOT_APPLICABLE' as const, source: notApplicable.source_system }
  }
  // There is no FK from a vehicle product to vehicle_models in the audited DB.
  // Membership is therefore catalog evidence only, never verified fitment.
  return {
    status: hasVehicleProduct ? 'UNKNOWN' as const : 'CATALOG_ASSOCIATION' as const,
    source: memberships[0]?.source_system ?? null,
  }
}

function toDiscovery(row: AccessoryRow, dataAsOf: string, input: DiscoverAccessoriesInput) {
  const variants = row.product_variants ?? []
  const inventory = aggregateInventory(variants)
  const prices = variants.filter((variant) => variant.is_active !== false).map(effectivePrice).filter((item): item is number => item !== null)
  const association = associationFor(row, Boolean(input.vehicleProductId))
  return {
    productId: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    description: row.description ?? null,
    price: prices.length ? Math.min(...prices) : number(row.displayed_price),
    availableQuantity: inventory.quantity,
    availability: inventory.state,
    associationStatus: association.status,
    associationSource: association.source,
    dataAsOf,
    sourceUpdatedAt: [row.updated_at, ...variants.map((variant) => variant.updated_at), inventory.updatedAt]
      .filter((item): item is string => Boolean(item)).sort().at(-1) ?? null,
  } satisfies SalesAgentAccessoryDiscovery
}

export async function discoverSalesAgentAccessories(input: DiscoverAccessoriesInput): Promise<DiscoverAccessoriesResult> {
  const dataAsOf = new Date().toISOString()
  const { data, error } = await getSupabaseAdmin()
    .from('products')
    .select(SALES_AGENT_ACCESSORY_READ_SELECT)
    .eq('is_active', true)
    .eq('product_type', 'ACCESSORY')
    .limit(200)
  if (error) throw new Error(`Không thể đọc catalog phụ kiện cho agent: ${error.message}`)

  const queryTerms = terms(input.query ?? '')
  const rows = (data ?? []) as unknown as AccessoryRow[]
  const items = rows
    .map((row) => {
      const item = toDiscovery(row, dataAsOf, input)
      const haystack = normalizeProductSearchText(`${item.name} ${item.slug} ${item.description ?? ''}`)
      const queryScore = queryTerms.filter((term) => haystack.includes(term)).length
      return { item, queryScore }
    })
    .filter(({ item, queryScore }) => {
      if (queryTerms.length > 0 && queryScore === 0) return false
      if (input.stockFilter === 'IN_STOCK' && item.availability !== 'IN_STOCK') return false
      if (input.minPrice !== undefined && (item.price === null || item.price < input.minPrice)) return false
      if (input.maxPrice !== undefined && (item.price === null || item.price > input.maxPrice)) return false
      return true
    })
    .sort((left, right) => right.queryScore - left.queryScore || (left.item.price ?? Number.MAX_SAFE_INTEGER) - (right.item.price ?? Number.MAX_SAFE_INTEGER))
    .slice(0, Math.min(20, Math.max(1, input.limit ?? 8)))
    .map(({ item }) => item)

  const warnings = [
    ...(input.vehicleProductId
      ? [{ code: 'VEHICLE_MODEL_MAPPING_MISSING', message: 'Catalog hiện chưa có mapping product xe → vehicle model; kết quả không xác nhận tương thích kỹ thuật.' }]
      : []),
    ...(items.some((item) => item.availability === 'UNKNOWN')
      ? [{ code: 'INVENTORY_UNKNOWN', message: 'Một số phụ kiện chưa xác định được tồn kho từ quan hệ inventory hiện tại.' }]
      : []),
  ]

  return {
    items,
    warnings,
  }
}
