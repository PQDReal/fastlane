import { NextResponse } from 'next/server'

import { requireCurrentCustomer } from '@/lib/api/customer'
import { ApiRouteError, apiErrorResponse } from '@/lib/api/errors'
import { parseItemId } from '@/lib/cart/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type RouteContext = { params: Promise<{ orderId: string }> }

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const customer = await requireCurrentCustomer()
    const { orderId: rawOrderId } = await context.params
    const orderId = parseItemId(rawOrderId)
    const supabase = getSupabaseAdmin()

    let lookup = await supabase.from('deposit_orders')
      .select('id,status')
      .eq('id', orderId)
      .eq('customer_id', customer.id)
      .maybeSingle<{ id: string; status: string }>()
    if (lookup.error) throw lookup.error

    if (!lookup.data) {
      lookup = await supabase.from('deposit_orders')
        .select('id,status')
        .eq('id', orderId)
        .eq('email', customer.email)
        .maybeSingle<{ id: string; status: string }>()
      if (lookup.error) throw lookup.error
    }

    if (!lookup.data) {
      throw new ApiRouteError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy đơn đặt cọc.')
    }
    if (!['PENDING_DEPOSIT', 'PENDING_CONFIRMATION', 'PENDING', 'CONFIRMED'].includes(lookup.data.status)) {
      throw new ApiRouteError(409, 'DEPOSIT_CANNOT_BE_CANCELLED', 'Đơn đặt cọc ở trạng thái hiện tại không thể hủy.')
    }

    const cancelledAt = new Date().toISOString()
    const paidAttempt = await supabase.from('vnpay_deposit_attempts')
      .select('id')
      .eq('deposit_order_id', orderId)
      .eq('status', 'PAID')
      .limit(1)
      .maybeSingle<{ id: string }>()
    if (paidAttempt.error) throw paidAttempt.error
    const update = await supabase.from('deposit_orders')
      .update({
        status: 'CANCELLED',
        refund_status: paidAttempt.data ? 'PENDING' : 'NONE',
        updated_at: cancelledAt,
      })
      .eq('id', orderId)
      .eq('status', lookup.data.status)
      .select('id,status,refund_status,updated_at')
      .maybeSingle<{ id: string; status: string; refund_status: string; updated_at: string }>()
    if (update.error) throw update.error
    if (!update.data) {
      throw new ApiRouteError(409, 'DEPOSIT_CANNOT_BE_CANCELLED', 'Trạng thái đơn vừa thay đổi. Vui lòng tải lại trang.')
    }

    return NextResponse.json({ data: update.data })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
