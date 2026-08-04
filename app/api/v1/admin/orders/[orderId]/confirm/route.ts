import { NextResponse } from 'next/server'

import { apiErrorResponse, ApiRouteError } from '@/lib/api/errors'
import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { parseItemId } from '@/lib/cart/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type RouteContext = { params: Promise<{ orderId: string }> }

export async function POST(request: Request, context: RouteContext) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    if (error instanceof ApiAuthError) return authErrorResponse(error)
    return apiErrorResponse(error)
  }

  try {
    const { orderId: rawOrderId } = await context.params
    const orderId = parseItemId(rawOrderId)
    const result = await getSupabaseAdmin()
      .from('orders')
      .update({ status: 'CONFIRMED', updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .eq('status', 'PAID')
      .select('id,order_number,status,updated_at')
      .maybeSingle()

    if (result.error) {
      if (result.error.code === '23514' && result.error.message.includes('INVALID_ORDER_TRANSITION')) {
        throw new ApiRouteError(
          409,
          'INVALID_ORDER_TRANSITION',
          'Database chưa cho phép chuyển đơn đã thanh toán sang trạng thái đã xác nhận.',
        )
      }
      throw result.error
    }
    if (!result.data) {
      throw new ApiRouteError(409, 'ORDER_NOT_AWAITING_CONFIRMATION', 'Chỉ có thể xác nhận đơn hàng đã thanh toán.')
    }
    return NextResponse.json({ data: result.data })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
