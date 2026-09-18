import { NextResponse } from 'next/server'

import { requireCurrentCustomer } from '@/lib/api/customer'
import { ApiRouteError, apiErrorResponse } from '@/lib/api/errors'
import { parseItemId } from '@/lib/cart/validation'
import { readCustomerOrder } from '@/lib/orders/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { notifyAdminCustomerCancelledOrder } from '@/lib/notifications/server'

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
    if (customer.role !== 'CUSTOMER') {
      throw new ApiRouteError(403, 'ADMIN_ORDER_CANCELLATION_FORBIDDEN', 'Tài khoản quản trị phải hủy đơn từ trang quản trị.')
    }
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
    if (!['PENDING', 'PAID', 'CONFIRMED', 'CANCELLED'].includes(lookup.data.status)) {
      throw new ApiRouteError(409, 'ORDER_CANNOT_BE_CANCELLED', 'Đơn hàng ở trạng thái hiện tại không thể hủy.')
    }

    const cancellationNote = 'Khách hàng yêu cầu hủy đơn.'
    const cancellation = await supabase.rpc('cancel_accessory_order_audited', {
      p_order_id: orderId,
      p_actor_type: 'CUSTOMER',
      p_actor_user_id: customer.id,
      p_reason_code: 'other',
      p_note: cancellationNote,
      p_event_key: `ACCESSORY_ORDER_CANCELLED:${orderId}`,
    }).single<{
      order_status: string
      refund_status: string
      cancelled_at: string
      cancellation_event_id: string
      replayed: boolean
    }>()

    if (cancellation.error) {
      if (cancellation.error.message.includes('ACCESSORY_ORDER_CANNOT_BE_CANCELLED_FROM')
        || cancellation.error.message.includes('IDEMPOTENCY_KEY_CONFLICT')) {
        throw new ApiRouteError(409, 'ORDER_CANNOT_BE_CANCELLED', 'Đơn hàng ở trạng thái hiện tại không thể hủy.')
      }
      console.error('Unable to cancel accessory order:', {
        orderId,
        code: cancellation.error.code,
        message: cancellation.error.message,
        details: cancellation.error.details,
        hint: cancellation.error.hint,
      })
      throw new ApiRouteError(
        500,
        'ORDER_CANCELLATION_FAILED',
        process.env.NODE_ENV === 'development'
          ? `Không thể hủy đơn hàng: ${cancellation.error.message}`
          : 'Không thể hủy đơn hàng do lỗi xử lý dữ liệu.',
      )
    }

    const cancelledOrder = await readCustomerOrder(customer.id, orderId)
    if (!cancellation.data.replayed) {
      await notifyAdminCustomerCancelledOrder({ id: orderId, orderNumber: cancelledOrder.orderNumber }).catch((error) => {
        console.error('Unable to notify admins about customer cancellation:', { orderId, error })
      })
    }
    return NextResponse.json({ data: cancelledOrder })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
