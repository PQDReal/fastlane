import { NextResponse } from 'next/server'

import { requireCurrentCustomer } from '@/lib/api/customer'
import { ApiRouteError, apiErrorResponse } from '@/lib/api/errors'
import { parseItemId } from '@/lib/cart/validation'
import { VnPayConfigError } from '@/lib/payments/vnpay'
import { createOrReuseVnPayVehicleBalancePayment } from '@/lib/services/vnpay-payment-service'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type RouteContext = { params: Promise<{ orderId: string }> }

export async function POST(request: Request, context: RouteContext) {
  try {
    const customer = await requireCurrentCustomer()
    const { orderId: rawOrderId } = await context.params
    const orderId = parseItemId(rawOrderId)
    const supabase = getSupabaseAdmin()
    let lookup = await supabase.from('deposit_orders').select('id,order_number,status')
      .eq('id', orderId).eq('customer_id', customer.id).maybeSingle<{ id: string; order_number: string; status: string }>()
    if (lookup.error) throw lookup.error
    if (!lookup.data) {
      lookup = await supabase.from('deposit_orders').select('id,order_number,status')
        .eq('id', orderId).eq('email', customer.email).maybeSingle<{ id: string; order_number: string; status: string }>()
      if (lookup.error) throw lookup.error
    }
    if (!lookup.data) throw new ApiRouteError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy đơn mua xe.')
    if (!['CONTRACT_SIGNED', 'PENDING_PAYMENT'].includes(lookup.data.status)) {
      throw new ApiRouteError(409, 'BALANCE_NOT_PAYABLE', 'Đơn không ở trạng thái chờ thanh toán phần còn lại.')
    }
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    const paymentUrl = await createOrReuseVnPayVehicleBalancePayment(
      { id: lookup.data.id, orderNumber: lookup.data.order_number },
      forwarded || request.headers.get('x-real-ip') || '127.0.0.1',
      { forceNewAttempt: true },
    )
    return NextResponse.json({ data: { paymentUrl } })
  } catch (error) {
    if (error instanceof VnPayConfigError) return apiErrorResponse(new ApiRouteError(503, 'VNPAY_NOT_CONFIGURED', error.message))
    return apiErrorResponse(error)
  }
}
