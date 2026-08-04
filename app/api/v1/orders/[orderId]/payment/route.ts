import { NextResponse } from 'next/server'

import { requireCurrentCustomer } from '@/lib/api/customer'
import { ApiRouteError, apiErrorResponse } from '@/lib/api/errors'
import { parseItemId } from '@/lib/cart/validation'
import { VnPayConfigError } from '@/lib/payments/vnpay'
import { createOrReuseVnPayPayment } from '@/lib/services/vnpay-payment-service'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type RouteContext = { params: Promise<{ orderId: string }> }

function clientIp(request: Request) {
  return request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || '127.0.0.1'
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const customer = await requireCurrentCustomer()
    const { orderId: rawOrderId } = await context.params
    const orderId = parseItemId(rawOrderId)
    const lookup = await getSupabaseAdmin()
      .from('orders')
      .select('id,order_number,status')
      .eq('id', orderId)
      .eq('customer_id', customer.id)
      .maybeSingle<{ id: string; order_number: string; status: string }>()

    if (lookup.error) throw lookup.error
    if (!lookup.data) throw new ApiRouteError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy đơn hàng.')
    if (lookup.data.status !== 'PENDING') {
      throw new ApiRouteError(409, 'ORDER_NOT_PENDING_PAYMENT', 'Đơn hàng này không còn ở trạng thái chờ thanh toán.')
    }

    const paymentUrl = await createOrReuseVnPayPayment(
      { id: lookup.data.id, orderNumber: lookup.data.order_number },
      clientIp(request),
      { forceNewAttempt: true },
    )
    return NextResponse.json({ data: { paymentUrl } })
  } catch (error) {
    if (error instanceof VnPayConfigError) {
      return apiErrorResponse(new ApiRouteError(503, 'PAYMENT_GATEWAY_NOT_CONFIGURED', error.message))
    }
    return apiErrorResponse(error)
  }
}
