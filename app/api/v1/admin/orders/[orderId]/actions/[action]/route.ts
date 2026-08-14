import { NextResponse } from 'next/server'

import { apiErrorResponse, ApiRouteError } from '@/lib/api/errors'
import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { requireAdminMutationIdentity } from '@/lib/auth/admin-mutation-identity'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { parseItemId } from '@/lib/cart/validation'
import { reconcileVnPayPayment, VnPayPaymentReconciliationError } from '@/lib/services/vnpay-payment-reconciliation-service'
import { reconcileVnPayRefund, refundCancelledOrder, VnPayRefundError } from '@/lib/services/vnpay-refund-service'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type RouteContext = { params: Promise<{ orderId: string; action: string }> }

export async function POST(request: Request, context: RouteContext) {
  let adminSubject: string
  try {
    const authorization = await authorizeAdminCatalogRequest(request)
    adminSubject = authorization.subject
  } catch (error) {
    if (error instanceof ApiAuthError) return authErrorResponse(error)
    return apiErrorResponse(error)
  }

  try {
    const { orderId: rawOrderId, action } = await context.params
    const orderId = parseItemId(rawOrderId)
    const supabase = getSupabaseAdmin()

    if (action === 'cancel') {
      const admin = await requireAdminMutationIdentity(request, adminSubject)
      const cancellationNote = 'Quản trị viên hủy đơn trước khi giao hàng.'
      const result = await supabase.rpc('cancel_accessory_order_audited', {
        p_order_id: orderId,
        p_actor_type: 'ADMIN',
        p_actor_user_id: admin.id,
        p_reason_code: 'admin_decision',
        p_note: cancellationNote,
        p_event_key: `ACCESSORY_ORDER_CANCELLED:${orderId}`,
      }).single<{
        order_status: string
        refund_status: string
        cancelled_at: string
        cancellation_event_id: string
        replayed: boolean
      }>()
      if (result.error) throw result.error
      return NextResponse.json({
        data: {
          status: result.data.order_status,
          refundStatus: result.data.refund_status,
          cancellation: {
            actorType: 'ADMIN',
            actorUserId: admin.id,
            actorEmail: admin.email,
            reasonCode: 'admin_decision',
            note: cancellationNote,
            cancelledAt: result.data.cancelled_at,
            auditVersion: 2,
            isLegacy: false,
            timeInferred: false,
          },
          replayed: result.data.replayed,
        },
      })
    }

    if (action === 'ship') {
      const current = await supabase.from('orders').select('status,refund_status').eq('id', orderId).maybeSingle()
      if (current.error) throw current.error
      if (!current.data) throw new ApiRouteError(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng.')
      if (current.data.status !== 'CONFIRMED') {
        throw new ApiRouteError(409, 'INVALID_ORDER_TRANSITION', 'Chỉ đơn đã xác nhận và chờ lấy hàng mới có thể chuyển sang giao hàng.')
      }

      const shipping = await supabase.from('orders')
        .update({ status: 'READY', updated_at: new Date().toISOString() })
        .eq('id', orderId)
        .eq('status', 'CONFIRMED')
        .select('status,refund_status')
        .maybeSingle()
      if (shipping.error) throw shipping.error
      if (!shipping.data) throw new ApiRouteError(409, 'INVALID_ORDER_TRANSITION', 'Trạng thái đơn hàng vừa được thay đổi. Vui lòng thử lại.')
      return NextResponse.json({ data: { status: shipping.data.status, refundStatus: shipping.data.refund_status } })
    }

    if (action === 'complete') {
      const completed = await supabase.from('orders')
        .update({ status: 'DELIVERED', updated_at: new Date().toISOString() })
        .eq('id', orderId)
        .eq('status', 'READY')
        .select('status,refund_status')
        .maybeSingle()
      if (completed.error) throw completed.error
      if (!completed.data) throw new ApiRouteError(409, 'INVALID_ORDER_TRANSITION', 'Chỉ đơn đang giao hàng mới có thể chuyển sang hoàn thành.')
      return NextResponse.json({ data: { status: completed.data.status, refundStatus: completed.data.refund_status } })
    }

    if (action === 'refund') {
      const admin = await requireAdminMutationIdentity(request, adminSubject)
      const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      const result = await refundCancelledOrder({
        orderId,
        requestedBy: admin.email,
        clientIp: forwarded || request.headers.get('x-real-ip') || '127.0.0.1',
      })
      return NextResponse.json({ data: { status: 'CANCELLED', ...result } })
    }

    if (action === 'refund-status') {
      const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      const result = await reconcileVnPayRefund({ orderId, clientIp: forwarded || request.headers.get('x-real-ip') || '127.0.0.1' })
      return NextResponse.json({ data: { status: 'CANCELLED', ...result } })
    }

    if (action === 'reconcile-payment') {
      const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      const result = await reconcileVnPayPayment({
        orderId,
        orderKind: 'accessory',
        clientIp: forwarded || request.headers.get('x-real-ip') || '127.0.0.1',
      })
      return NextResponse.json({
        data: {
          paymentAttemptStatus: result.status,
          reason: result.reason,
          message: result.message,
        },
      })
    }

    throw new ApiRouteError(404, 'ACTION_NOT_FOUND', 'Thao tác đơn hàng không hợp lệ.')
  } catch (error) {
    if (error instanceof VnPayPaymentReconciliationError) {
      return apiErrorResponse(new ApiRouteError(
        error.code === 'ORDER_NOT_FOUND' ? 404 : 502,
        error.code,
        error.message,
      ))
    }
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
    const message = typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : ''
    if (message.includes('ACCESSORY_ORDER_NOT_FOUND')) {
      return apiErrorResponse(new ApiRouteError(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng.'))
    }
    if (message.includes('ACCESSORY_ORDER_CANNOT_BE_CANCELLED_FROM')) {
      return apiErrorResponse(new ApiRouteError(409, 'INVALID_ORDER_TRANSITION', 'Đơn hàng không còn ở trạng thái có thể hủy.'))
    }
    if (message.includes('IDEMPOTENCY_KEY_CONFLICT')) {
      return apiErrorResponse(new ApiRouteError(409, 'ORDER_ALREADY_CANCELLED', 'Đơn hàng đã được hủy bởi một thao tác khác.'))
    }
    if (message.includes('ACCESSORY_CANCELLATION_ACTOR_INVALID')) {
      return apiErrorResponse(new ApiRouteError(403, 'ADMIN_IDENTITY_REQUIRED', 'Không xác định được tài khoản quản trị thực hiện thao tác.'))
    }
    return apiErrorResponse(error)
  }
}
