import { NextResponse } from 'next/server'

import { apiErrorResponse, ApiRouteError } from '@/lib/api/errors'
import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { getCurrentUser } from '@/lib/auth/current-user'
import { parseItemId } from '@/lib/cart/validation'
import { reconcileVnPayRefund, refundCancelledOrder, VnPayRefundError } from '@/lib/services/vnpay-refund-service'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type RouteContext = { params: Promise<{ orderId: string; action: string }> }

export async function POST(request: Request, context: RouteContext) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    if (error instanceof ApiAuthError) return authErrorResponse(error)
    return apiErrorResponse(error)
  }

  try {
    const { orderId: rawOrderId, action } = await context.params
    const orderId = parseItemId(rawOrderId)
    const supabase = getSupabaseAdmin()

    if (action === 'cancel') {
      const order = await supabase.from('orders').select('customer_id').eq('id', orderId).maybeSingle()
      if (order.error) throw order.error
      if (!order.data) throw new ApiRouteError(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng.')
      const result = await supabase.rpc('cancel_accessory_order', {
        p_order_id: orderId,
        p_actor_customer_id: order.data.customer_id,
        p_reason: 'ADMIN_CANCELLED',
      }).single<{ status: string; refund_status: string }>()
      if (result.error) throw result.error
      return NextResponse.json({ data: { status: result.data.status, refundStatus: result.data.refund_status } })
    }

    if (action === 'complete') {
      const current = await supabase.from('orders').select('status,refund_status').eq('id', orderId).maybeSingle()
      if (current.error) throw current.error
      if (!current.data) throw new ApiRouteError(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng.')
      if (current.data.status !== 'CONFIRMED' && current.data.status !== 'READY') {
        throw new ApiRouteError(409, 'INVALID_ORDER_TRANSITION', 'Chỉ đơn đã xác nhận mới có thể hoàn thành.')
      }

      if (current.data.status === 'CONFIRMED') {
        const ready = await supabase.from('orders')
          .update({ status: 'READY', updated_at: new Date().toISOString() })
          .eq('id', orderId)
          .eq('status', 'CONFIRMED')
          .select('id')
          .maybeSingle()
        if (ready.error) throw ready.error
        if (!ready.data) throw new ApiRouteError(409, 'INVALID_ORDER_TRANSITION', 'Trạng thái đơn hàng vừa được thay đổi. Vui lòng thử lại.')
      }

      const delivered = await supabase.from('orders')
        .update({ status: 'DELIVERED', updated_at: new Date().toISOString() })
        .eq('id', orderId)
        .eq('status', 'READY')
        .select('status,refund_status')
        .maybeSingle()
      if (delivered.error) throw delivered.error
      if (!delivered.data) throw new ApiRouteError(409, 'INVALID_ORDER_TRANSITION', 'Không thể hoàn thành đơn hàng ở trạng thái hiện tại.')
      return NextResponse.json({ data: { status: delivered.data.status, refundStatus: delivered.data.refund_status } })
    }

    if (action === 'refund') {
      const admin = await getCurrentUser()
      const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      const result = await refundCancelledOrder({
        orderId,
        requestedBy: admin?.email ?? 'admin',
        clientIp: forwarded || request.headers.get('x-real-ip') || '127.0.0.1',
      })
      return NextResponse.json({ data: { status: 'CANCELLED', ...result } })
    }

    if (action === 'refund-status') {
      const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      const result = await reconcileVnPayRefund({ orderId, clientIp: forwarded || request.headers.get('x-real-ip') || '127.0.0.1' })
      return NextResponse.json({ data: { status: 'CANCELLED', ...result } })
    }

    throw new ApiRouteError(404, 'ACTION_NOT_FOUND', 'Thao tác đơn hàng không hợp lệ.')
  } catch (error) {
    if (error instanceof VnPayRefundError) {
      const conflictCodes = ['REFUND_NOT_PENDING', 'REFUND_ALREADY_REQUESTED', 'REFUND_NOT_PROCESSING']
      return apiErrorResponse(new ApiRouteError(
        conflictCodes.includes(error.code) ? 409 : error.code === 'ORDER_NOT_FOUND' ? 404 : 502,
        error.code,
        error.message,
      ))
    }
    if (typeof error === 'object' && error && 'message' in error && String(error.message).includes('INVALID_ORDER_TRANSITION')) {
      return apiErrorResponse(new ApiRouteError(409, 'INVALID_ORDER_TRANSITION', 'Không thể chuyển trạng thái đơn hàng ở bước hiện tại.'))
    }
    return apiErrorResponse(error)
  }
}
