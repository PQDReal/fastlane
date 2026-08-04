import { NextResponse } from 'next/server'

import { requireCurrentCustomer } from '@/lib/api/customer'
import { ApiRouteError, apiErrorResponse } from '@/lib/api/errors'
import { parseItemId } from '@/lib/cart/validation'
import { readCustomerOrder } from '@/lib/orders/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type RouteContext = { params: Promise<{ orderId: string }> }

export async function GET(_request: Request, context: RouteContext) {
  try {
    const customer = await requireCurrentCustomer()
    const { orderId } = await context.params
    const order = await readCustomerOrder(customer.id, parseItemId(orderId))
    return NextResponse.json({ data: order })
  } catch (error) {
    return apiErrorResponse(error)
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const customer = await requireCurrentCustomer()
    const { orderId: rawOrderId } = await context.params
    const orderId = parseItemId(rawOrderId)
    const supabase = getSupabaseAdmin()
    const lookup = await supabase
      .from('orders')
      .select('id,status')
      .eq('id', orderId)
      .eq('customer_id', customer.id)
      .maybeSingle<{ id: string; status: string }>()

    if (lookup.error) throw lookup.error
    if (!lookup.data) throw new ApiRouteError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy đơn hàng.')
    if (lookup.data.status !== 'PENDING' && lookup.data.status !== 'PAID') {
      throw new ApiRouteError(409, 'ORDER_CANNOT_BE_CANCELLED', 'Đơn hàng ở trạng thái hiện tại không thể hủy.')
    }

    const cancellation = await supabase.rpc('cancel_accessory_order', {
      p_order_id: orderId,
      p_actor_customer_id: customer.id,
      p_reason: 'Khách hàng yêu cầu hủy đơn',
    })

    if (cancellation.error) {
      if (cancellation.error.message.includes('ORDER_CANNOT_BE_CANCELLED_FROM')) {
        throw new ApiRouteError(409, 'ORDER_CANNOT_BE_CANCELLED', 'Đơn hàng ở trạng thái hiện tại không thể hủy.')
      }
      throw cancellation.error
    }

    return NextResponse.json({ data: await readCustomerOrder(customer.id, orderId) })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
