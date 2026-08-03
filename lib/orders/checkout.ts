import 'server-only'

import { createHash } from 'node:crypto'

import { ApiRouteError } from '@/lib/api/errors'
import type { CheckoutRequest } from '@/lib/cart/types'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { readCustomerOrder } from '@/lib/orders/server'

function requestHash(customerId: string, request: CheckoutRequest) {
  return createHash('sha256')
    .update(JSON.stringify({ customerId, request }))
    .digest('hex')
}

function checkoutError(message: string) {
  const code = [
    'CART_CHANGED',
    'PRICE_CHANGED',
    'OUT_OF_STOCK',
    'IDEMPOTENCY_KEY_REUSED',
    'PROMOTION_NOT_FOUND',
    'PROMOTION_INACTIVE',
    'PROMOTION_NOT_STARTED',
    'PROMOTION_EXPIRED',
    'PROMOTION_USAGE_LIMIT',
    'PROMOTION_MINIMUM_NOT_MET',
    'PROMOTION_NOT_APPLICABLE',
  ].find((candidate) => message.includes(candidate))

  if (code) {
    if (code.startsWith('PROMOTION_')) {
      return new ApiRouteError(
        422,
        'PROMOTION_NOT_APPLICABLE',
        'Mã giảm giá không còn hợp lệ. Vui lòng kiểm tra và áp dụng lại.',
      )
    }
    return new ApiRouteError(
      409,
      code,
      code === 'OUT_OF_STOCK'
        ? 'Requested quantity is unavailable.'
        : 'Cart or checkout state changed; review it before retrying.',
    )
  }
  if (message.includes('CART_EMPTY')) {
    return new ApiRouteError(422, 'CART_EMPTY', 'Cart must contain an item.')
  }
  if (message.includes('checkout_accessory_cart')) {
    return new ApiRouteError(
      503,
      'SERVICE_UNAVAILABLE',
      'Checkout database migration has not been applied.',
    )
  }
  if (message.includes('orders_shipping_address_required_fields')) {
    return new ApiRouteError(
      503,
      'SERVICE_UNAVAILABLE',
      'Cấu hình địa chỉ giao hàng chưa đồng bộ. Vui lòng thử lại sau.',
    )
  }
  if (
    (message.includes('product_type_snapshot') &&
      message.includes('product_type')) ||
    message.includes('operator does not exist: text = product_type')
  ) {
    return new ApiRouteError(
      503,
      'SERVICE_UNAVAILABLE',
      'Cấu hình loại sản phẩm chưa đồng bộ. Vui lòng thử lại sau.',
    )
  }
  return null
}

export async function checkoutCustomerCart(
  customerId: string,
  idempotencyKey: string,
  request: CheckoutRequest,
) {
  if (request.acceptedGrandTotal !== request.acceptedAmountDueNow) {
    throw new ApiRouteError(
      409,
      'PRICE_CHANGED',
      'Accessory orders require full payment at checkout.',
    )
  }

  const hash = requestHash(customerId, request)
  const shippingAddress = {
    ...request.shippingAddress,
    ...(request.note ? { note: request.note } : {}),
  }
  const { data, error } = await getSupabaseAdmin().rpc(
    'checkout_accessory_cart',
    {
      p_customer_id: customerId,
      p_idempotency_key: idempotencyKey,
      p_request_hash: hash,
      p_expected_cart_version: request.expectedCartVersion,
      p_accepted_total: request.acceptedGrandTotal,
      p_shipping_address: shippingAddress,
      p_cart_item_ids: request.cartItemIds,
      p_promotion_code: request.promotionCode ?? null,
    },
  )

  if (error) {
    if (error.code === '23505') {
      const { data: existing } = await getSupabaseAdmin()
        .from('orders')
        .select('id, request_hash')
        .eq('customer_id', customerId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle<{ id: string; request_hash: string }>()

      if (existing?.request_hash === hash) {
        return readCustomerOrder(customerId, existing.id)
      }
      throw new ApiRouteError(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'Idempotency key was reused with a different request.',
      )
    }

    throw checkoutError(error.message) ?? new Error(`Checkout failed: ${error.message}`)
  }

  const orderId =
    data && typeof data === 'object' && 'orderId' in data
      ? String(data.orderId)
      : ''
  if (!orderId) throw new Error('Checkout did not return an order ID.')

  return readCustomerOrder(customerId, orderId)
}
