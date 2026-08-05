import { NextResponse } from 'next/server'

import { requireCurrentCustomer } from '@/lib/api/customer'
import { ApiRouteError, apiErrorResponse } from '@/lib/api/errors'
import { parseItemId } from '@/lib/cart/validation'
import { VnPayConfigError } from '@/lib/payments/vnpay'
import { createOrReuseVnPayDepositPayment } from '@/lib/services/vnpay-payment-service'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type RouteContext = { params: Promise<{ orderId: string }> }

function clientIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || '127.0.0.1'
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const customer = await requireCurrentCustomer()
    if (customer.role !== 'CUSTOMER') {
      throw new ApiRouteError(403, 'ADMIN_DEPOSIT_FORBIDDEN', 'Tài khoản quản trị không được thanh toán đơn đặt cọc.')
    }
    const { orderId: rawOrderId } = await context.params
    const orderId = parseItemId(rawOrderId)
    const supabase = getSupabaseAdmin()

    let lookup = await supabase.from('deposit_orders')
      .select('id,order_number,status')
      .eq('id', orderId).eq('customer_id', customer.id)
      .maybeSingle<{ id: string; order_number: string; status: string }>()
    if (lookup.error) throw lookup.error
    if (!lookup.data) {
      lookup = await supabase.from('deposit_orders')
        .select('id,order_number,status')
        .eq('id', orderId).eq('email', customer.email)
        .maybeSingle<{ id: string; order_number: string; status: string }>()
      if (lookup.error) throw lookup.error
    }
    if (!lookup.data) throw new ApiRouteError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy đơn đặt cọc.')
    if (lookup.data.status !== 'PENDING_DEPOSIT') {
      throw new ApiRouteError(409, 'DEPOSIT_NOT_PAYABLE', 'Đơn đặt cọc không ở trạng thái chờ thanh toán.')
    }

    const paymentUrl = await createOrReuseVnPayDepositPayment(
      { id: lookup.data.id, orderNumber: lookup.data.order_number },
      clientIp(request),
      { forceNewAttempt: true },
    )
    return NextResponse.json({ data: { paymentUrl } })
  } catch (error) {
    if (error instanceof VnPayConfigError) {
      return apiErrorResponse(new ApiRouteError(503, 'VNPAY_NOT_CONFIGURED', error.message))
    }
    return apiErrorResponse(error)
  }
}
