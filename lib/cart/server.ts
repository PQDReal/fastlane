import 'server-only'

import { ApiRouteError } from '@/lib/api/errors'
import type { ApiCart, ApiCartItem } from '@/lib/cart/types'
import { variantImageForSku } from '@/lib/cart/variant-media'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type CartRow = {
  id: string
  customer_id: string
  status: 'ACTIVE' | 'CONVERTED' | 'ABANDONED'
  updated_at: string
}

type VariantRow = {
  id: string
  sku: string
  name: string
  original_price: number | string
  sale_price: number | string | null
  is_active: boolean
  product: {
    id: string
    name: string
    slug: string
    product_type: 'ACCESSORY' | 'VEHICLE'
    is_active: boolean
    image_urls: unknown
    specifications: unknown
  }
  inventory: { on_hand_quantity: number } | null
}

type CartItemRow = { quantity: number; variant: VariantRow }

const fullPurchaseTerms: ApiCartItem['purchaseTerms'] = {
  paymentMode: 'full',
  depositAmount: null,
  initialPaymentWindowMinutes: 30,
  balancePaymentWindowDays: null,
  gracePeriodHours: null,
  cancellationPolicy: {
    customerCancellationAllowed: true,
    customerCancellationCutoff: 'before_shipping',
    refundPercentage: 100,
    overdueRefundPercentage: 100,
    cancellationFeeAmount: '0',
  },
}

function numericMoney(value: number | string | null) {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount) || amount < 0) {
    throw new ApiRouteError(
      422,
      'PRICE_CHANGED',
      'A catalog price is invalid.',
    )
  }
  return Math.round(amount)
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

async function readCartItems(cartId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('cart_items')
    .select(`
      quantity,
      variant:product_variants!inner(
        id,
        sku,
        name,
        original_price,
        sale_price,
        is_active,
        product:products!inner(id, name, slug, product_type, is_active, image_urls, specifications),
        inventory:inventory_items(on_hand_quantity)
      )
    `)
    .eq('cart_id', cartId)

  if (error) {
    throw new Error(`Unable to read cart items: ${error.message}`)
  }

  return (data ?? []) as unknown as CartItemRow[]
}

function mapCartItem(row: CartItemRow): ApiCartItem {
  const variant = row.variant
  if (
    !variant?.is_active ||
    !variant.product?.is_active ||
    variant.product.product_type !== 'ACCESSORY'
  ) {
    throw new ApiRouteError(
      409,
      'CART_CHANGED',
      'A cart item is no longer available.',
    )
  }

  const listPrice = numericMoney(variant.original_price)
  const salePrice =
    variant.sale_price === null ? null : numericMoney(variant.sale_price)
  const unitPrice = salePrice ?? listPrice
  const quantity = Number(row.quantity)
  const lineTotal = unitPrice * quantity

  return {
    id: variant.id,
    variantId: variant.id,
    productId: variant.product.id,
    productSlug: variant.product.slug,
    productName: variant.product.name,
    productKind: 'accessory',
    purchaseTerms: fullPurchaseTerms,
    sku: variant.sku,
    variantAttributes:
      variant.name === 'Mặc định' ? {} : { name: variant.name },
    selectedOptions: [],
    quantity,
    unitListPrice: String(listPrice),
    unitSalePrice: salePrice === null ? null : String(salePrice),
    unitOptionTotal: '0',
    unitPrice: String(unitPrice),
    unitAmountDueNow: String(unitPrice),
    lineTotal: String(lineTotal),
    lineAmountDueNow: String(lineTotal),
    imageUrl: variantImageForSku(variant.product, variant.sku),
    availableQuantity: Math.max(
      0,
      Number(variant.inventory?.on_hand_quantity ?? 0),
    ),
  }
}

export async function readCustomerCart(customerId: string): Promise<ApiCart> {
  const cart = await ensureActiveCart(customerId)
  const rows = await readCartItems(cart.id)
  const items = rows.map(mapCartItem)
  const subtotal = items.reduce(
    (total, item) => total + Number(item.lineTotal),
    0,
  )

  return {
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
}

async function readAccessoryVariant(variantId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('product_variants')
    .select(`
      id,
      sku,
      name,
      original_price,
      sale_price,
      is_active,
      product:products!inner(id, name, slug, product_type, is_active, image_urls, specifications),
      inventory:inventory_items(on_hand_quantity)
    `)
    .eq('id', variantId)
    .maybeSingle()

  if (error) {
    throw new Error(`Unable to read variant: ${error.message}`)
  }
  if (!data) {
    throw new ApiRouteError(404, 'RESOURCE_NOT_FOUND', 'Variant was not found.')
  }

  const variant = data as unknown as VariantRow
  if (
    !variant.is_active ||
    !variant.product?.is_active ||
    variant.product.product_type !== 'ACCESSORY'
  ) {
    throw new ApiRouteError(404, 'RESOURCE_NOT_FOUND', 'Variant was not found.')
  }
  return variant
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
  const variant = await readAccessoryVariant(variantId)
  const available = Number(variant.inventory?.on_hand_quantity ?? 0)
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
      'Requested quantity is unavailable.',
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
  return readCustomerCart(customerId)
}

export async function updateCustomerCartItem(
  customerId: string,
  variantId: string,
  quantity: number,
) {
  const variant = await readAccessoryVariant(variantId)
  const available = Number(variant.inventory?.on_hand_quantity ?? 0)
  if (available < quantity) {
    throw new ApiRouteError(
      409,
      'OUT_OF_STOCK',
      'Requested quantity is unavailable.',
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
  return readCustomerCart(customerId)
}
