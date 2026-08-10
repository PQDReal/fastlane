'use server'

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { getCurrentUser } from '@/lib/auth/current-user'
import { refundCancelledDepositOrder } from '@/lib/services/vnpay-refund-service'
import { tryAutoIssueContract } from '@/lib/deposit/contract-service'

async function requireAdmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'ADMIN') throw new Error('Bạn không có quyền thực hiện thao tác này.')
  return user
}

export async function updateOrderStatus(orderId: string, newStatus: string) {
  try {
    const admin = await requireAdmin()
    const supabase = getSupabaseAdmin()

    if (newStatus === 'CANCELLED') {
      const { data, error } = await supabase.rpc('admin_cancel_deposit_order_before_signature', {
        p_order_id: orderId,
        p_actor_user_id: admin.id,
        p_cancellation_note: 'Quản trị viên hủy đơn trước khi khách hàng ký tài liệu đặt mua.',
        p_event_key: `ADMIN_DEPOSIT_CANCELLED:${orderId}:V1`,
      }).single<{
        order_status: string
        refund_status: string
        cancelled_at: string
        replayed: boolean
      }>()
      if (error || !data) throw error || new Error('Không thể hủy đơn đặt cọc.')

      let refundStatus = data.refund_status
      if (refundStatus === 'PENDING') {
        const requestHeaders = await headers()
        const clientIp = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
          || requestHeaders.get('x-real-ip')
          || '127.0.0.1'
        try {
          const refund = await refundCancelledDepositOrder({
            orderId,
            requestedBy: admin.email,
            clientIp,
          })
          refundStatus = refund.refundStatus
        } catch (refundError) {
          console.error('Unable to start automatic admin deposit refund', { orderId, refundError })
        }
      }

      revalidatePath('/admin/orders')
      revalidatePath('/profile')
      return { success: true, refundStatus }
    }

    if (newStatus === 'CONFIRMED') {
      const paid = await supabase.from('vnpay_deposit_attempts')
        .select('id')
        .eq('deposit_order_id', orderId)
        .eq('status', 'PAID')
        .limit(1)
        .maybeSingle()
      if (paid.error) throw paid.error
      if (!paid.data) return { success: false, error: 'Chỉ có thể duyệt đơn đã thanh toán tiền cọc.' }

      const confirmed = await supabase.from('deposit_orders')
        .update({ status: 'CONFIRMED', updated_at: new Date().toISOString() })
        .eq('id', orderId)
        .eq('status', 'PENDING_CONFIRMATION')
        .select('id')
        .maybeSingle()
      if (confirmed.error) throw confirmed.error
      if (!confirmed.data) return { success: false, error: 'Đơn không còn ở trạng thái chờ duyệt.' }

      const issueResult = await tryAutoIssueContract(supabase, orderId)
      if (!issueResult.success && issueResult.reason !== 'NOT_READY') {
        console.error('Auto issue after admin approval failed', {
          orderId,
          reason: issueResult.reason,
          error: issueResult.error,
        })
      }
      revalidatePath('/admin/orders')
      revalidatePath('/profile')
      return { success: true }
    }

    if (newStatus === 'DELIVERED' || newStatus === 'COMPLETED') {
      const eventType = newStatus === 'DELIVERED' ? 'VEHICLE_DELIVERED' : 'DEPOSIT_ORDER_COMPLETED'
      const { error } = await supabase.rpc('advance_deposit_order_delivery', {
        p_order_id: orderId,
        p_actor_user_id: admin.id,
        p_target_status: newStatus,
        p_event_key: `${eventType}:${orderId}:V1`,
        p_note: newStatus === 'DELIVERED'
          ? 'Quản trị viên xác nhận đã bàn giao xe.'
          : 'Quản trị viên xác nhận hoàn thành đơn mua xe.',
      })
      if (error) throw error
      revalidatePath('/admin/orders')
      revalidatePath('/profile')
      return { success: true }
    }

    return {
      success: false,
      error: 'Trạng thái này chỉ được cập nhật qua thao tác nghiệp vụ tương ứng.',
    }
  } catch (err: any) {
    console.error('Exception updating order status:', err)
    const message = err instanceof Error ? err.message : 'Không thể cập nhật trạng thái đơn hàng.'
    const userMessage = message.includes('DEPOSIT_CANNOT_BE_CANCELLED')
      ? 'Không thể hủy đơn đã ký tài liệu hoặc đã bước vào quy trình giao xe.'
      : message.includes('DELIVERY_TRANSITION_INVALID_ORDER_STATE')
        ? 'Trạng thái đơn vừa thay đổi. Vui lòng tải lại trước khi tiếp tục.'
        : message.includes('DELIVERY_TRANSITION_SIGNED_DOCUMENT_REQUIRED')
          ? 'Đơn chưa có bằng chứng tài liệu đã ký hợp lệ.'
          : message
    return { success: false, error: userMessage }
  }
}

export async function notifyVehicleReadyForDelivery(orderId: string) {
  try {
    const admin = await requireAdmin()
    const { data, error } = await getSupabaseAdmin().rpc('mark_deposit_order_vehicle_ready', {
      p_order_id: orderId,
      p_actor_user_id: admin.id,
      p_event_key: `VEHICLE_READY_FOR_DELIVERY:${orderId}`,
      p_vehicle_ready_at: null,
      p_note: 'Admin xác nhận xe sẵn sàng và chuyển sang chuẩn bị bàn giao.',
    })
    if (error) throw error
    revalidatePath('/admin/orders')
    revalidatePath('/profile')
    return { success: true, data: Array.isArray(data) ? data[0] : data }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể xác nhận xe sẵn sàng.'
    const userMessage = message.includes('SIGNED_DOCUMENT_REQUIRED')
        ? 'Đơn chưa có bằng chứng hợp đồng đã ký hợp lệ.'
        : message.includes('INVALID_ORDER_STATE')
          ? 'Đơn không còn ở trạng thái chờ xe sẵn sàng.'
          : message
    return { success: false, error: userMessage }
  }
}

export async function confirmDepositRefund(orderId: string) {
  try {
    const admin = await requireAdmin()
    const supabase = getSupabaseAdmin()
    const { error: queueError } = await supabase.rpc('admin_queue_cancelled_deposit_refund', {
      p_order_id: orderId,
      p_actor_user_id: admin.id,
      p_event_key: `REFUND_QUEUED:ADMIN_REPAIR:${orderId}:V1`,
    })
    if (queueError) throw queueError
    const requestHeaders = await headers()
    const clientIp = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
      || requestHeaders.get('x-real-ip')
      || '127.0.0.1'
    const result = await refundCancelledDepositOrder({
      orderId,
      requestedBy: admin.email,
      clientIp,
    })
    revalidatePath('/admin/orders')
    revalidatePath('/profile')
    return { success: true, ...result }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Không thể gửi yêu cầu hoàn tiền VNPay.' }
  }
}

// Dành cho mục đích test/developer mode để vượt qua các bước thanh toán/KYC
export async function forceOrderState(orderId: string, action: 'mock_deposit_paid' | 'mock_kyc_approved' | 'mock_contract_signed' | 'mock_full_paid') {
  await requireAdmin()
  const supabase = getSupabaseAdmin()

  try {
    let updates: any = { updated_at: new Date().toISOString() }

    switch (action) {
      case 'mock_deposit_paid':
        updates.status = 'CONFIRMED'
        updates.payment_status = 'Paid'
        break
      case 'mock_kyc_approved':
        updates.kyc_status = 'APPROVED'
        updates.status = 'PENDING_CONTRACT'
        break
      case 'mock_contract_signed':
        updates.status = 'CONTRACT_SIGNED'
        updates.contract_signed_at = new Date().toISOString()
        break
      case 'mock_full_paid':
        updates.status = 'PAID'
        break
    }

    const { error } = await supabase
      .from('deposit_orders')
      .update(updates)
      .eq('id', orderId)

    if (error) throw error

    revalidatePath('/admin/orders')
    return { success: true }
  } catch (err: any) {
    console.error('Exception forcing order state:', err)
    return { success: false, error: err.message }
  }
}
