import 'server-only'

import { isAdminSellableVehicleVariant } from '@/lib/admin-inventory'
import {
  canonicalInventoryProductType,
  inventoryVariantFilterValue,
  normalizeInventoryText,
  sortedInventoryValues,
} from '@/lib/admin-inventory-filter'
import type { AdminInventoryQueryParams } from '@/lib/admin-inventory-query'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type JoinedCategory = { name: string }
type JoinedProduct = {
  id: string
  name: string
  product_type: string
  is_active: boolean
  categories: JoinedCategory | JoinedCategory[] | null
}
type JoinedInventory = { on_hand_quantity: number; updated_at: string } | null
type VariantRow = {
  id: string
  sku: string
  name: string
  is_active: boolean
  products: JoinedProduct | JoinedProduct[] | null
  inventory_items: JoinedInventory | JoinedInventory[]
}
type VehicleRow = {
  product_id: string | null
  product_variant_id: string | null
  product_type: string | null
  sku: string | null
  variant_name: string | null
  version: string | null
  color: string | null
  interior_color: string | null
  specs?: { catalog?: { interior_color?: string | null } | null } | null
  is_active: boolean
}

export type LegacyAdminInventoryItem = {
  variantId: string
  productId: string | null
  sku: string | null
  productName: string
  variantName: string
  productType: string
  categoryName: string | null
  version: string | null
  color: string | null
  interiorColor: string | null
  inventoryKey: string | null
  onHandQuantity: number
  updatedAt: string | null
  variantIsActive: boolean
  productIsActive: boolean
  isActive: boolean
  inventoryStatus: 'INACTIVE' | 'UNLINKED' | 'MISSING_INVENTORY' | 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK'
  isSellable: boolean
  hasInventoryRow: boolean
}

function statusOf(item: Pick<LegacyAdminInventoryItem, 'productId' | 'isActive' | 'hasInventoryRow' | 'onHandQuantity'>): LegacyAdminInventoryItem['inventoryStatus'] {
  if (!item.productId) return 'UNLINKED'
  if (!item.isActive) return 'INACTIVE'
  if (!item.hasInventoryRow) return 'MISSING_INVENTORY'
  if (item.onHandQuantity <= 0) return 'OUT_OF_STOCK'
  if (item.onHandQuantity <= 5) return 'LOW_STOCK'
  return 'IN_STOCK'
}

export async function loadLegacyAdminInventory(): Promise<LegacyAdminInventoryItem[]> {
  const supabase = getSupabaseAdmin()
  const [variantsResult, vehiclesResult] = await Promise.all([
    supabase
      .from('product_variants')
      .select('id,sku,name,is_active,products(id,name,product_type,is_active,categories(name)),inventory_items(on_hand_quantity,updated_at)')
      .order('sku', { ascending: true }),
    supabase
      .from('vehicle_variants')
      .select('product_id,product_variant_id,product_type,sku,variant_name,version,color,interior_color,specs,is_active'),
  ])
  if (variantsResult.error) throw new Error(variantsResult.error.message)
  if (vehiclesResult.error) throw new Error(vehiclesResult.error.message)

  const variants = (variantsResult.data ?? []) as unknown as VariantRow[]
  const vehicles = (vehiclesResult.data ?? []) as VehicleRow[]
  const variantProductById = new Map(variants.map((variant) => {
    const product = Array.isArray(variant.products) ? variant.products[0] : variant.products
    return [variant.id, product?.id ?? null] as const
  }))
  const sellableVehicles = vehicles.filter((vehicle) => (
    isAdminSellableVehicleVariant(vehicle)
    && variantProductById.get(String(vehicle.product_variant_id)) === vehicle.product_id
  ))
  const vehicleByVariantId = new Map(
    sellableVehicles.map((vehicle) => [String(vehicle.product_variant_id), vehicle]),
  )
  const sellableVehicleIds = new Set(vehicleByVariantId.keys())

  return variants.flatMap((variant) => {
    const product = Array.isArray(variant.products) ? variant.products[0] : variant.products
    const productType = String(product?.product_type ?? 'UNKNOWN')
    if (['CAR', 'BIKE'].includes(productType.toUpperCase()) && !sellableVehicleIds.has(variant.id)) {
      return []
    }
    const inventory = Array.isArray(variant.inventory_items)
      ? variant.inventory_items[0]
      : variant.inventory_items
    const category = Array.isArray(product?.categories) ? product.categories[0] : product?.categories
    const vehicle = vehicleByVariantId.get(variant.id)
    const interiorColor = vehicle?.interior_color?.trim()
      || vehicle?.specs?.catalog?.interior_color?.trim()
      || null
    const item: LegacyAdminInventoryItem = {
      variantId: variant.id,
      productId: product?.id ?? null,
      sku: variant.sku || null,
      productName: product?.name ?? 'Chưa xác định',
      variantName: vehicle?.variant_name || variant.name,
      productType,
      categoryName: category?.name ?? null,
      version: vehicle?.version ?? null,
      color: vehicle?.color ?? null,
      interiorColor,
      inventoryKey: vehicle?.version && vehicle.color
        ? JSON.stringify([vehicle.version, vehicle.color, interiorColor || ''])
        : null,
      onHandQuantity: Math.max(0, Number(inventory?.on_hand_quantity ?? 0) || 0),
      updatedAt: inventory?.updated_at ?? null,
      variantIsActive: variant.is_active,
      productIsActive: Boolean(product?.is_active),
      isActive: Boolean(variant.is_active && product?.is_active),
      inventoryStatus: 'OUT_OF_STOCK',
      isSellable: Boolean(product?.id),
      hasInventoryRow: Boolean(inventory),
    }
    item.inventoryStatus = statusOf(item)
    return [item]
  })
}

function matchesSearch(item: LegacyAdminInventoryItem, search: string | null) {
  const normalized = normalizeInventoryText(search)
  if (!normalized) return true
  const searchable = normalizeInventoryText([
    item.sku,
    item.productName,
    item.variantName,
    item.version,
    item.color,
    item.interiorColor,
    item.categoryName,
    item.productType,
  ].filter(Boolean).join(' '))
  return normalized.split(' ').filter(Boolean).every((token) => searchable.includes(token))
}

function filteredItems(items: LegacyAdminInventoryItem[], params: AdminInventoryQueryParams) {
  return items.filter((item) => {
    if (!matchesSearch(item, params.search)) return false
    if (params.productType !== 'ALL' && canonicalInventoryProductType(item.productType) !== params.productType) return false
    if (params.productId && item.productId !== params.productId) return false
    if (params.variant && inventoryVariantFilterValue(item) !== params.variant) return false
    if (params.color && item.color !== params.color) return false
    if (params.interiorColor && item.interiorColor !== params.interiorColor) return false
    if (params.status !== 'ALL' && item.inventoryStatus !== params.status) return false
    if (params.activity === 'ACTIVE' && !item.isActive) return false
    if (params.activity === 'INACTIVE' && item.isActive) return false
    return true
  })
}

function cursorOffset(cursor: string | null) {
  if (!cursor) return 0
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'))
    return Number.isInteger(parsed?.offset) && parsed.offset >= 0 ? parsed.offset : 0
  } catch {
    return 0
  }
}

export function queryLegacyAdminInventory(
  items: LegacyAdminInventoryItem[],
  params: AdminInventoryQueryParams,
) {
  const filtered = filteredItems(items, params)
  const offset = cursorOffset(params.cursor)
  const page = filtered.slice(offset, offset + params.limit)
  const nextOffset = offset + page.length
  const hasMore = nextOffset < filtered.length
  const statusCounts = {
    INACTIVE: 0,
    UNLINKED: 0,
    MISSING_INVENTORY: 0,
    OUT_OF_STOCK: 0,
    LOW_STOCK: 0,
    IN_STOCK: 0,
  }
  for (const item of filtered) statusCounts[item.inventoryStatus] += 1

  return {
    items: page,
    nextCursor: hasMore
      ? Buffer.from(JSON.stringify({ offset: nextOffset }), 'utf8').toString('base64')
      : null,
    hasMore,
    limit: params.limit,
    summary: {
      totalRows: filtered.length,
      totalQuantity: filtered.reduce((sum, item) => sum + item.onHandQuantity, 0),
      statusCounts,
    },
  }
}

export function legacyAdminInventoryFilterOptions(
  items: LegacyAdminInventoryItem[],
  productType: AdminInventoryQueryParams['productType'],
  productId: string | null,
) {
  const typeCounts = { ALL: items.length, CAR: 0, BIKE: 0, ACCESSORY: 0 }
  for (const item of items) {
    const type = canonicalInventoryProductType(item.productType)
    if (type !== 'UNKNOWN') typeCounts[type] += 1
  }
  const typed = productType === 'ALL'
    ? items
    : items.filter((item) => canonicalInventoryProductType(item.productType) === productType)
  const scoped = productId ? typed.filter((item) => item.productId === productId) : typed
  const products = [...new Map(typed.flatMap((item) => item.productId ? [[item.productId, {
    id: item.productId,
    name: item.productName,
    productType: canonicalInventoryProductType(item.productType),
  }]] : [])).values()]
    .sort((left, right) => left.name.localeCompare(right.name, 'vi'))
  const option = (value: string) => ({ value, label: value })

  return {
    typeCounts,
    products,
    variants: sortedInventoryValues(scoped.map((item) => inventoryVariantFilterValue(item))).map(option),
    colors: sortedInventoryValues(scoped.map((item) => item.color)).map(option),
    interiorColors: sortedInventoryValues(scoped.map((item) => item.interiorColor)).map(option),
  }
}
