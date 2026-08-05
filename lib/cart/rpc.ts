import 'server-only'

import { ApiRouteError } from '@/lib/api/errors'
import type { ApiCart } from '@/lib/cart/types'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export type CartMutationOperation = 'ADD' | 'SET' | 'REMOVE'

function errorMessage(error: { message?: unknown; code?: unknown }) {
  const message = typeof error.message === 'string' ? error.message : ''
  const code = typeof error.code === 'string' ? error.code : ''
  return `${code} ${message}`.trim()
}

export function mapCartMutationRpcError(error: { message?: unknown; code?: unknown }): never {
  const message = errorMessage(error)
  if (message.includes('OUT_OF_STOCK')) {
    throw new ApiRouteError(
      409,
      'OUT_OF_STOCK',
      'Đã đạt giới hạn tối đa của mặt hàng này',
    )
  }
  if (message.includes('RESOURCE_NOT_FOUND')) {
    throw new ApiRouteError(
      404,
      'RESOURCE_NOT_FOUND',
      'Mặt hàng trong giỏ không còn khả dụng.',
    )
  }
  if (message.includes('CART_CHANGED')) {
    throw new ApiRouteError(
      409,
      'CART_CHANGED',
      'Giỏ hàng đã thay đổi; vui lòng tải lại trước khi thử lại.',
    )
  }
  if (message.includes('AUTHENTICATION_REQUIRED')) {
    throw new ApiRouteError(
      401,
      'AUTHENTICATION_REQUIRED',
      'Authentication is required.',
    )
  }
  if (message.includes('INSUFFICIENT_PERMISSION')) {
    throw new ApiRouteError(
      403,
      'INSUFFICIENT_PERMISSION',
      'A customer or admin account is required.',
    )
  }
  if (message.includes('VALIDATION_ERROR') || message.includes('22023')) {
    throw new ApiRouteError(
      400,
      'VALIDATION_ERROR',
      'Thông tin cập nhật giỏ hàng không hợp lệ.',
    )
  }
  throw new Error(`Cart mutation RPC failed: ${message || 'unknown error'}`)
}

function isCart(value: unknown): value is ApiCart {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ApiCart>
  return (
    typeof candidate.id === 'string'
    && typeof candidate.version === 'number'
    && Array.isArray(candidate.items)
    && typeof candidate.pricing === 'object'
    && candidate.pricing !== null
  )
}

export async function mutateCustomerCartItemViaRpc(
  customerId: string,
  variantId: string,
  operation: CartMutationOperation,
  quantity?: number,
): Promise<ApiCart> {
  const { data, error } = await getSupabaseAdmin().rpc(
    'mutate_accessory_cart_item_v1',
    {
      p_customer_id: customerId,
      p_variant_id: variantId,
      p_operation: operation,
      p_quantity: quantity ?? null,
    },
  )

  if (error) mapCartMutationRpcError(error)
  if (!isCart(data)) {
    throw new Error('Cart mutation RPC returned an invalid cart snapshot.')
  }
  return data
}
