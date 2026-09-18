import 'server-only'

import { createHash } from 'node:crypto'

import { ApiRouteError } from '@/lib/api/errors'
import { customerCartCacheKey } from '@/lib/cache-keys'
import type { CheckoutRequest } from '@/lib/cart/types'
import { deleteRedisKey } from '@/lib/redis'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { readCustomerOrder } from '@/lib/orders/server'

function requestHash(customerId: string, request: CheckoutRequest) {
  return createHash('sha256')
    .update(JSON.stringify({ customerId, request }))
    .digest('hex')
}

function sourceCartIdFromUniqueViolation(details: string | null | undefined) {
  const match = details?.match(/Key \(source_cart_id\)=\(([0-9a-f-]{36})\) already exists/i)
  return match?.[1] ?? null
}

async function recoverPendingOrderForSourceCart(
  customerId: string,
  sourceCartId: string,
) {
  const result = await getSupabaseAdmin()
    .from('orders')
    .select('id,status')
    .eq('customer_id', customerId)
    .eq('source_cart_id', sourceCartId)
    .maybeSingle<{ id: string; status: string }>()

  if (result.error) throw new Error(`Unable to recover checkout order: ${result.error.message}`)
  if (!result.data || result.data.status !== 'PENDING') return null
  await deleteRedisKey(customerCartCacheKey(customerId))
  return readCustomerOrder(customerId, result.data.id)
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
        ? 'Đã đạt giới hạn tối đa của mặt hàng này'
        : 'Giỏ hàng hoặc trạng thái thanh toán đã thay đổi; vui lòng kiểm tra lại.',
    )
  }
  if (message.includes('CART_EMPTY')) {
    return new ApiRouteError(422, 'CART_EMPTY', 'Cart must contain an item.')
  }
  if (message.includes('checkout_accessory_cart')) {
    return new ApiRouteError(
      503,
      'SERVICE_UNAVAILABLE',
      'Cấu hình cơ sở dữ liệu chưa được đồng bộ. Vui lòng thử lại sau.',
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
      'Yêu cầu thanh toán đầy đủ cho đơn đặt hàng phụ kiện tại thời điểm thanh toán.',
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
        await deleteRedisKey(customerCartCacheKey(customerId))
        return readCustomerOrder(customerId, existing.id)
      }
      if (existing) {
        throw new ApiRouteError(
          409,
          'IDEMPOTENCY_KEY_REUSED',
          'Yêu cầu thanh toán này đã được gửi trước đó với dữ liệu khác. Vui lòng tải lại trang trước khi thử lại.',
        )
      }

      const sourceCartId = sourceCartIdFromUniqueViolation(error.details)
      if (sourceCartId) {
        const recovered = await recoverPendingOrderForSourceCart(customerId, sourceCartId)
        if (recovered) return recovered
      }

      console.error('Unexpected unique constraint violation during accessory checkout:', {
        customerId,
        idempotencyKey,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      })
      throw new ApiRouteError(
        409,
        'CHECKOUT_CONFLICT',
        process.env.NODE_ENV === 'development'
          ? `Không thể tạo đơn do dữ liệu bị trùng: ${error.details || error.message}`
          : 'Không thể tạo đơn do dữ liệu bị trùng. Vui lòng thử lại; nếu lỗi tiếp diễn, hãy liên hệ hỗ trợ.',
      )
    }

    throw checkoutError(error.message) ?? new Error(`Phiên thanh toán thất bại: ${error.message}`)
  }

  const orderId =
    data && typeof data === 'object' && 'orderId' in data
      ? String(data.orderId)
      : ''
  if (!orderId) throw new Error('Phiên thanh toán đã được tạo nhưng không có ID đơn hàng. Vui lòng liên hệ bộ phận hỗ trợ khách hàng.')

  await deleteRedisKey(customerCartCacheKey(customerId))
  return readCustomerOrder(customerId, orderId)
}
