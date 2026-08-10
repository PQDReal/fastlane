import { NextResponse } from 'next/server'

import { requireCurrentCustomer } from '@/lib/api/customer'
import { ApiRouteError, apiErrorResponse } from '@/lib/api/errors'
import { parseItemId } from '@/lib/cart/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { notifyAdminCustomerCancelledDeposit } from '@/lib/notifications/server'
import { refundCancelledDepositOrder } from '@/lib/services/vnpay-refund-service'
import { claimGuestDepositOrder, normalizeDepositOwnerEmail } from '@/lib/deposit/order-ownership'

type RouteContext = { params: Promise<{ orderId: string }> }

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const customer = await requireCurrentCustomer()
    if (customer.role !== 'CUSTOMER') {
      throw new ApiRouteError(403, 'ADMIN_DEPOSIT_FORBIDDEN', 'Tài khoản quản trị không được hủy đơn đặt cọc.')
    }
    const { orderId: rawOrderId } = await context.params
    const orderId = parseItemId(rawOrderId)
    const supabase = getSupabaseAdmin()

    let lookup = await supabase.from('deposit_orders')
      .select('id,order_number,status,contract_signed_at,customer_id,email,cancellation_reason_code')
      .eq('id', orderId)
      .eq('customer_id', customer.id)
      .maybeSingle<{ id: string; order_number: string; status: string; contract_signed_at?: string | null; customer_id: string | null; email: string | null; cancellation_reason_code?: string | null }>()
    if (lookup.error) throw lookup.error

    if (!lookup.data) {
      lookup = await supabase.from('deposit_orders')
        .select('id,order_number,status,contract_signed_at,customer_id,email,cancellation_reason_code')
        .eq('id', orderId)
        .eq('email', normalizeDepositOwnerEmail(customer.email))
        .maybeSingle<{ id: string; order_number: string; status: string; contract_signed_at?: string | null; customer_id: string | null; email: string | null; cancellation_reason_code?: string | null }>()
      if (lookup.error) throw lookup.error
    }

    if (!lookup.data) {
      throw new ApiRouteError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy đơn đặt cọc.')
    }

    await claimGuestDepositOrder(supabase, lookup.data, customer)

    const ALLOWED_CANCEL_STATUSES = ['PENDING_DEPOSIT', 'PENDING_CONFIRMATION', 'PENDING', 'CONFIRMED', 'PENDING_CONTRACT', 'CANCELLED']
    if (!ALLOWED_CANCEL_STATUSES.includes(lookup.data.status) || lookup.data.contract_signed_at) {
      throw new ApiRouteError(409, 'DEPOSIT_CANNOT_BE_CANCELLED', 'Đơn đặt cọc ở trạng thái hiện tại hoặc đã ký hợp đồng không thể tự hủy.')
    }

    const cancellationReason = ['CUSTOMER_CANCELLED_BEFORE_CONTRACT', 'CUSTOMER_CANCELLED_PENDING_SIGNATURE']
      .includes(lookup.data.cancellation_reason_code ?? '')
      ? lookup.data.cancellation_reason_code as 'CUSTOMER_CANCELLED_BEFORE_CONTRACT' | 'CUSTOMER_CANCELLED_PENDING_SIGNATURE'
      : lookup.data.status === 'PENDING_CONTRACT'
        ? 'CUSTOMER_CANCELLED_PENDING_SIGNATURE'
        : 'CUSTOMER_CANCELLED_BEFORE_CONTRACT'

    const { data: cancelled, error: cancelError } = await supabase.rpc('cancel_deposit_order_before_signature', {
      p_order_id: orderId,
      p_customer_id: customer.id,
      p_cancellation_reason_code: cancellationReason,
      p_event_key: `DEPOSIT_CANCELLED:${orderId}`,
    }).single<{ order_status: string; refund_status: string; cancelled_at: string; replayed: boolean }>()
    if (cancelError || !cancelled) {
      throw new ApiRouteError(409, 'DEPOSIT_CANNOT_BE_CANCELLED', 'Trạng thái đơn vừa thay đổi. Vui lòng tải lại trang.')
    }

    if (!cancelled.replayed) {
      await notifyAdminCustomerCancelledDeposit({ id: orderId, orderNumber: lookup.data.order_number }).catch((error) => {
        console.error('Unable to notify admins about customer deposit cancellation:', { orderId, error })
      })
    }

    let refundResult: Awaited<ReturnType<typeof refundCancelledDepositOrder>> | null = null
    if (cancelled.refund_status === 'PENDING') {
      const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || '127.0.0.1'
      try {
        refundResult = await refundCancelledDepositOrder({
          orderId,
          requestedBy: customer.email || customer.id,
          clientIp,
        })
      } catch (error) {
        console.error('Unable to start automatic deposit refund:', { orderId, error })
      }
    }

    return NextResponse.json({
      data: {
        id: orderId,
        status: cancelled.order_status,
        refund_status: refundResult?.refundStatus || cancelled.refund_status,
        cancelled_at: cancelled.cancelled_at,
      },
    }, { status: cancelled.refund_status === 'PENDING' ? 202 : 200 })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
