import 'server-only'

import { ApiRouteError } from '@/lib/api/errors'
import { customerCartCacheKey } from '@/lib/cache-keys'
import {
  mapCartVariantProjectionItem,
  type CartVariantProjection,
} from '@/lib/cart/catalog-item'
import type { ApiCart } from '@/lib/cart/types'
import {
  mutateCustomerCartItemViaRpc,
  type CartMutationOperation,
} from '@/lib/cart/rpc'
import { deleteRedisKey, readRedisJson, writeRedisJson } from '@/lib/redis'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const CUSTOMER_CART_TTL_SECONDS = 60

type CartRow = {
  id: string
  customer_id: string
  status: 'ACTIVE' | 'CONVERTED' | 'ABANDONED'
  updated_at: string
}

type CartItemRow = {
  variant_id: string
  quantity: number
}

const CART_VARIANT_PROJECTION_SELECT = `
  id,
  product_id,
  sku,
  name,
  original_price,
  sale_price,
  is_active,
  inventory:inventory_items(on_hand_quantity),
  product:products!inner(
    id,
    name,
    slug,
    product_type,
    is_active,
    media:product_media(id,variant_id,url,display_order,is_active)
  ),
  option_mappings:product_variant_option_values(
    option_group_id,
    option_value_id,
    option_group:product_option_groups(id,code,name,display_order),
    option_value:product_option_values(id,code,name,price_adjustment,display_order)
  )
`

type UnknownRecord = Record<string, unknown>

function records(value: unknown): UnknownRecord[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is UnknownRecord => (
      item !== null && typeof item === 'object' && !Array.isArray(item)
    ),
  )
}

function firstRecord(value: unknown): UnknownRecord | null {
  if (Array.isArray(value)) {
    const first = value[0]
    return first !== null && typeof first === 'object' && !Array.isArray(first)
      ? first as UnknownRecord
      : null
  }
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function number(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function mapCartProjection(row: UnknownRecord): CartVariantProjection | null {
  const product = firstRecord(row.product)
  const variantId = text(row.id)
  if (!product || !variantId || product.product_type !== 'ACCESSORY') return null

  const selectedOptions = records(row.option_mappings)
    .map((mapping) => {
      const group = firstRecord(mapping.option_group)
      const value = firstRecord(mapping.option_value)
      if (!group || !value) return null
      return {
        groupId: text(group.id),
        groupCode: text(group.code),
        groupName: text(group.name),
        valueId: text(value.id),
        valueCode: text(value.code),
        valueName: text(value.name),
        priceAdjustment: String(Math.round(number(value.price_adjustment))),
        displayOrder: number(group.display_order),
      }
    })
    .filter((option): option is {
      groupId: string
      groupCode: string
      groupName: string
      valueId: string
      valueCode: string
      valueName: string
      priceAdjustment: string
      displayOrder: number
    } => option !== null)
    .sort((left, right) => (
      left.displayOrder - right.displayOrder
      || left.groupCode.localeCompare(right.groupCode)
    ))
    .map(({ displayOrder: _displayOrder, ...option }) => option)

  const imageUrls = records(product.media)
    .filter((media) => (
      media.is_active !== false
      && text(media.variant_id) === variantId
      && text(media.url).trim().length > 0
    ))
    .sort((left, right) => number(left.display_order) - number(right.display_order))
    .map((media) => text(media.url))

  const inventory = firstRecord(row.inventory)
  return {
    product: {
      id: text(product.id),
      name: text(product.name),
      slug: text(product.slug),
    },
    variant: {
      id: variantId,
      productId: text(row.product_id),
      sku: text(row.sku),
      originalPrice: number(row.original_price),
      salePrice: nullableNumber(row.sale_price),
      availableQuantity: Math.max(0, Math.trunc(number(inventory?.on_hand_quantity))),
      selectedOptions,
      imageUrls,
    },
  }
}

function cartVersion(updatedAt: string) {
  const timestamp = Date.parse(updatedAt)
  return Number.isSafeInteger(timestamp) && timestamp >= 0 ? timestamp : 0
}

async function findActiveCart(customerId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('carts')
    .select('id, customer_id, status, updated_at')
    .eq('customer_id', customerId)
    .eq('status', 'ACTIVE')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle<CartRow>()

  if (error) {
    throw new Error(`Unable to read cart: ${error.message}`)
  }
  return data
}

async function ensureActiveCart(customerId: string) {
  const existing = await findActiveCart(customerId)
  if (existing) return existing

  const now = new Date().toISOString()
  const { data, error } = await getSupabaseAdmin()
    .from('carts')
    .insert({ customer_id: customerId, status: 'ACTIVE', updated_at: now })
    .select('id, customer_id, status, updated_at')
    .single<CartRow>()

  if (!error && data) return data

  if (error?.code === '23505') {
    const raced = await findActiveCart(customerId)
    if (raced) return raced
  }

  throw new Error(`Unable to create cart: ${error?.message ?? 'unknown error'}`)
}

async function readCartItems(cartId: string): Promise<CartItemRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('cart_items')
    .select('variant_id, quantity')
    .eq('cart_id', cartId)

  if (error) {
    throw new Error(`Unable to read cart items: ${error.message}`)
  }

  return (data ?? []) as CartItemRow[]
}

async function readCartItemContexts(
  rows: CartItemRow[],
): Promise<Map<string, CartVariantProjection>> {
  const variantIds = [...new Set(rows.map((row) => row.variant_id))]
  if (variantIds.length === 0) return new Map()

  const { data, error } = await getSupabaseAdmin()
    .from('product_variants')
    .select(CART_VARIANT_PROJECTION_SELECT)
    .in('id', variantIds)
    .eq('is_active', true)
    .eq('product.is_active', true)
    .eq('product.product_type', 'ACCESSORY')

  if (error) throw new Error(`Unable to read cart variant projection: ${error.message}`)

  return new Map(
    (data ?? [])
      .map((row) => mapCartProjection(row as UnknownRecord))
      .filter((context): context is CartVariantProjection => context !== null)
      .map((context) => [context.variant.id, context]),
  )
}

function cartItemQuantity(row: CartItemRow): number {
  const quantity = Number(row.quantity)
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new ApiRouteError(
      409,
      'CART_CHANGED',
      'A cart item has an invalid quantity.',
    )
  }
  return quantity
}

type ReadCartOptions = {
  fresh?: boolean
  activeCart?: CartRow
  skipCache?: boolean
}

export async function readCustomerCart(
  customerId: string,
  options: ReadCartOptions = {},
): Promise<ApiCart> {
  const cacheKey = customerCartCacheKey(customerId)
  if (!options.fresh && !options.skipCache) {
    const cachedCart = await readRedisJson<ApiCart>(cacheKey)
    if (cachedCart) return cachedCart
  }

  const cart = options.activeCart ?? await ensureActiveCart(customerId)
  const rows = await readCartItems(cart.id)
  const contextsByVariantId = await readCartItemContexts(rows)
  const items = rows.map((row) => {
    const context = contextsByVariantId.get(row.variant_id)
    if (!context) {
      throw new ApiRouteError(
        409,
        'CART_CHANGED',
        'A cart item is no longer available.',
      )
    }
    return mapCartVariantProjectionItem(context, cartItemQuantity(row))
  })
  const subtotal = items.reduce(
    (total, item) => total + Number(item.lineTotal),
    0,
  )

  const result: ApiCart = {
    id: cart.id,
    version: cartVersion(cart.updated_at),
    pricedAt: new Date().toISOString(),
    items,
    promotion: null,
    pricing: {
      currency: 'VND',
      subtotal: String(subtotal),
      discountTotal: '0',
      grandTotal: String(subtotal),
      amountDueNow: String(subtotal),
      balanceDue: '0',
    },
  }
  // Cache fill is best-effort. The database result is already canonical, so
  // a Redis SET must not extend the mutation/read critical path.
  void writeRedisJson(cacheKey, result, CUSTOMER_CART_TTL_SECONDS)
  return result
}

async function invalidateCustomerCart(customerId: string) {
  await deleteRedisKey(customerCartCacheKey(customerId))
}

async function mutateCustomerCartItem(
  customerId: string,
  variantId: string,
  operation: CartMutationOperation,
  quantity?: number,
) {
  const cart = await mutateCustomerCartItemViaRpc(
    customerId,
    variantId,
    operation,
    quantity,
  )
  // The database response is canonical. Cache invalidation is deliberately
  // best-effort and never extends the mutation critical path.
  void invalidateCustomerCart(customerId)
  return cart
}

export async function addCustomerCartItem(
  customerId: string,
  variantId: string,
  requestedQuantity: number,
) {
  return mutateCustomerCartItem(
    customerId,
    variantId,
    'ADD',
    requestedQuantity,
  )
}

export async function updateCustomerCartItem(
  customerId: string,
  variantId: string,
  quantity: number,
) {
  return mutateCustomerCartItem(
    customerId,
    variantId,
    'SET',
    quantity,
  )
}

export async function removeCustomerCartItem(
  customerId: string,
  variantId: string,
) {
  return mutateCustomerCartItem(
    customerId,
    variantId,
    'REMOVE',
  )
}
