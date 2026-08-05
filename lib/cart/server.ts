import 'server-only'

import { ApiRouteError } from '@/lib/api/errors'
import { customerCartCacheKey } from '@/lib/cache-keys'
import { getAccessoryCatalogVariantsByIds } from '@/lib/catalog/server'
import type { CatalogVariantContext } from '@/lib/catalog/types'
import { mapCatalogCartItem } from '@/lib/cart/catalog-item'
import type { ApiCart } from '@/lib/cart/types'
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
): Promise<Map<string, CatalogVariantContext>> {
  const contexts = await getAccessoryCatalogVariantsByIds(
    rows.map((row) => row.variant_id),
  )
  return new Map(contexts.map((context) => [context.variant.id, context]))
}

function cartItemQuantity(row: CartItemRow): number {
  const quantity = Number(row.quantity)
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    throw new ApiRouteError(
      409,
      'CART_CHANGED',
      'A cart item has an invalid quantity.',
    )
  }
  return quantity
}

export async function readCustomerCart(
  customerId: string,
  options: { fresh?: boolean } = {},
): Promise<ApiCart> {
  const cacheKey = customerCartCacheKey(customerId)
  if (!options.fresh) {
    const cachedCart = await readRedisJson<ApiCart>(cacheKey)
    if (cachedCart) return cachedCart
  }

  const cart = await ensureActiveCart(customerId)
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
    return mapCatalogCartItem(context, cartItemQuantity(row))
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
  await writeRedisJson(cacheKey, result, CUSTOMER_CART_TTL_SECONDS)
  return result
}

async function invalidateCustomerCart(customerId: string) {
  await deleteRedisKey(customerCartCacheKey(customerId))
}

async function readAccessoryVariant(
  variantId: string,
): Promise<CatalogVariantContext> {
  const context = (await getAccessoryCatalogVariantsByIds([variantId]))[0]
  if (!context) {
    throw new ApiRouteError(404, 'RESOURCE_NOT_FOUND', 'Variant was not found.')
  }
  return context
}

async function touchCart(cartId: string) {
  const { error } = await getSupabaseAdmin()
    .from('carts')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', cartId)

  if (error) throw new Error(`Unable to update cart: ${error.message}`)
}

export async function addCustomerCartItem(
  customerId: string,
  variantId: string,
  requestedQuantity: number,
) {
  const context = await readAccessoryVariant(variantId)
  const available = context.variant.availableQuantity
  const cart = await ensureActiveCart(customerId)
  const { data: existing, error: existingError } = await getSupabaseAdmin()
    .from('cart_items')
    .select('quantity')
    .eq('cart_id', cart.id)
    .eq('variant_id', variantId)
    .maybeSingle<{ quantity: number }>()

  if (existingError) {
    throw new Error(`Unable to inspect cart item: ${existingError.message}`)
  }

  const nextQuantity = Number(existing?.quantity ?? 0) + requestedQuantity
  if (available < nextQuantity) {
    throw new ApiRouteError(
      409,
      'OUT_OF_STOCK',
      'Đã đạt giới hạn tối đa của mặt hàng này',
    )
  }

  const { error } = await getSupabaseAdmin().from('cart_items').upsert(
    {
      cart_id: cart.id,
      variant_id: variantId,
      quantity: nextQuantity,
    },
    { onConflict: 'cart_id,variant_id' },
  )
  if (error) throw new Error(`Unable to add cart item: ${error.message}`)

  await touchCart(cart.id)
  await invalidateCustomerCart(customerId)
  return readCustomerCart(customerId)
}

export async function updateCustomerCartItem(
  customerId: string,
  variantId: string,
  quantity: number,
) {
  const context = await readAccessoryVariant(variantId)
  if (context.variant.availableQuantity < quantity) {
    throw new ApiRouteError(
      409,
      'OUT_OF_STOCK',
      'Đã đạt giới hạn tối đa của mặt hàng này',
    )
  }

  const cart = await findActiveCart(customerId)
  if (!cart) {
    throw new ApiRouteError(404, 'RESOURCE_NOT_FOUND', 'Cart item was not found.')
  }

  const { data, error } = await getSupabaseAdmin()
    .from('cart_items')
    .update({ quantity })
    .eq('cart_id', cart.id)
    .eq('variant_id', variantId)
    .select('variant_id')

  if (error) throw new Error(`Unable to update cart item: ${error.message}`)
  if (!data?.length) {
    throw new ApiRouteError(404, 'RESOURCE_NOT_FOUND', 'Cart item was not found.')
  }

  await touchCart(cart.id)
  await invalidateCustomerCart(customerId)
  return readCustomerCart(customerId)
}

export async function removeCustomerCartItem(
  customerId: string,
  variantId: string,
) {
  const cart = await findActiveCart(customerId)
  if (!cart) {
    throw new ApiRouteError(404, 'RESOURCE_NOT_FOUND', 'Cart item was not found.')
  }

  const { data, error } = await getSupabaseAdmin()
    .from('cart_items')
    .delete()
    .eq('cart_id', cart.id)
    .eq('variant_id', variantId)
    .select('variant_id')

  if (error) throw new Error(`Unable to remove cart item: ${error.message}`)
  if (!data?.length) {
    throw new ApiRouteError(404, 'RESOURCE_NOT_FOUND', 'Cart item was not found.')
  }

  await touchCart(cart.id)
  await invalidateCustomerCart(customerId)
  return readCustomerCart(customerId)
}
