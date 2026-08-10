'use server'

import { randomUUID } from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { getCurrentUser } from '@/lib/auth/current-user'
import { reconcileVnPayDepositRefund, refundCancelledDepositOrder } from '@/lib/services/vnpay-refund-service'
import { tryAutoIssueContract } from '@/lib/deposit/contract-service'
import { assertDepositDebugActionsEnabled } from '@/lib/deposit/debug-mode'
import { createDebugVnpayTransactionNo } from '@/lib/deposit/debug-transaction'

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

      revalidatePath('/admin/orders')
      revalidatePath('/profile')
      return { success: true, refundStatus: data.refund_status }
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

export async function syncKycStatus(orderId: string) {
  try {
    const admin = await requireAdmin()
    const supabase = getSupabaseAdmin()
    
    const { data: order, error: orderError } = await supabase
      .from('deposit_orders')
      .select('id, kyc_session_id, kyc_status, full_name, id_card_number')
      .eq('id', orderId)
      .maybeSingle()
      
    if (orderError) throw orderError
    if (!order) throw new Error('Không tìm thấy đơn đặt cọc.')
    if (!order.kyc_session_id) throw new Error('Đơn chưa có phiên xác minh KYC.')

    const diditRes = await fetch(`https://verification.didit.me/v3/session/${order.kyc_session_id}/decision/`, {
      headers: { 'x-api-key': process.env.DIDIT_API_KEY as string },
      cache: 'no-store'
    })

    if (!diditRes.ok) {
      if (diditRes.status === 404) throw new Error('Không tìm thấy phiên xác minh trên Didit.')
      throw new Error('Không thể lấy trạng thái từ Didit.')
    }

    const decision = await diditRes.json()
    const decisionStatus = String(decision.status || '').toLowerCase()

    if (decisionStatus === 'review' || decisionStatus === 'manual_review' || decisionStatus === 'in review' || decisionStatus === 'in_review') {
      if (order.kyc_status !== 'REVIEW') {
        await supabase.from('deposit_orders').update({ kyc_status: 'REVIEW', updated_at: new Date().toISOString() }).eq('id', orderId)
      }
      revalidatePath('/admin/orders')
      revalidatePath('/profile')
      return { success: true, message: 'KYC vẫn đang chờ duyệt (In Review).' }
    }

    if (decisionStatus === 'declined' || decisionStatus === 'rejected' || decisionStatus === 'resubmitted') {
      if (order.kyc_status !== 'DECLINED') {
        await supabase.from('deposit_orders').update({ kyc_status: 'DECLINED', updated_at: new Date().toISOString() }).eq('id', orderId)
      }
      revalidatePath('/admin/orders')
      revalidatePath('/profile')
      return { success: true, message: 'KYC đã bị từ chối hoặc yêu cầu làm lại.' }
    }

    if (decisionStatus === 'approved') {
      const doc = decision.document || decision.person
      let verifiedName = undefined
      let verifiedId = undefined

      if (doc) {
        verifiedName = doc.first_name ? `${doc.first_name} ${doc.last_name || ''}`.trim() : undefined
        verifiedId = doc.document_number
      }

      if (!verifiedName || !verifiedId) {
        await supabase.from('deposit_orders').update({ kyc_status: 'DECLINED', updated_at: new Date().toISOString() }).eq('id', orderId)
        revalidatePath('/admin/orders')
        revalidatePath('/profile')
        return { success: true, message: 'Thiếu thông tin định danh. Đã chuyển sang từ chối.' }
      }

      const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '')
      if (normalize(order.full_name) !== normalize(verifiedName) || normalize(order.id_card_number) !== normalize(verifiedId)) {
        await supabase.from('deposit_orders').update({ kyc_status: 'DECLINED', updated_at: new Date().toISOString() }).eq('id', orderId)
        revalidatePath('/admin/orders')
        revalidatePath('/profile')
        return { success: true, message: 'Thông tin không khớp. Đã chuyển sang từ chối.' }
      }

      const updatePayload: any = {
        kyc_status: 'APPROVED',
        updated_at: new Date().toISOString()
      }
      if (verifiedName) updatePayload.full_name = verifiedName
      if (verifiedId) updatePayload.id_card_number = verifiedId
      
      await supabase.from('deposit_orders').update(updatePayload).eq('id', orderId)
      await tryAutoIssueContract(supabase, orderId)

      revalidatePath('/admin/orders')
      revalidatePath('/profile')
      return { success: true, message: 'KYC đã được duyệt thành công!' }
    }

    return { success: true, message: `Trạng thái hiện tại trên Didit: ${decision.status}` }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Lỗi đồng bộ KYC' }
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

export async function reconcileDepositRefund(orderId: string) {
  try {
    await requireAdmin()
    const requestHeaders = await headers()
    const clientIp = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
      || requestHeaders.get('x-real-ip')
      || '127.0.0.1'
    const result = await reconcileVnPayDepositRefund({ orderId, clientIp })
    revalidatePath('/admin/orders')
    revalidatePath('/profile')
    return { success: true, ...result }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Không thể kiểm tra trạng thái hoàn tiền VNPay.' }
  }
}

export type DepositDebugAction = 'mock_deposit_paid' | 'mock_kyc_approved'

type SupabaseActionError = {
  message?: unknown
  code?: unknown
  details?: unknown
  hint?: unknown
}

function getDebugActionErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message

  if (error && typeof error === 'object') {
    const candidate = error as SupabaseActionError
    const message = typeof candidate.message === 'string' ? candidate.message.trim() : ''
    const code = typeof candidate.code === 'string' ? candidate.code : ''
    const details = typeof candidate.details === 'string' ? candidate.details : ''
    const hint = typeof candidate.hint === 'string' ? candidate.hint : ''
    const context = [message, code && `[${code}]`, details, hint].filter(Boolean).join(' - ')
    if (context) return context
  }

  return 'Không thể chạy thao tác debug.'
}

export async function runDepositDebugAction(orderId: string, action: DepositDebugAction) {
  try {
    const admin = await requireAdmin()
    assertDepositDebugActionsEnabled()
    if (action !== 'mock_deposit_paid' && action !== 'mock_kyc_approved' && action !== 'mock_confirm_order') {
      throw new Error('Thao tác debug không hợp lệ.')
    }
    const supabase = getSupabaseAdmin()

    if (action === 'mock_deposit_paid') {
      const { data: order, error: orderError } = await supabase
        .from('deposit_orders')
        .select('id,order_number,status,deposit_amount')
        .eq('id', orderId)
        .maybeSingle()
      if (orderError) throw orderError
      if (!order) throw new Error('Không tìm thấy đơn đặt cọc.')
      if (!['PENDING_DEPOSIT', 'PENDING', 'PENDING_CONFIRMATION'].includes(order.status)) {
        throw new Error('Đơn không còn ở giai đoạn cho phép mô phỏng thanh toán cọc.')
      }

      const existingPaid = await supabase
        .from('vnpay_deposit_attempts')
        .select('id')
        .eq('deposit_order_id', orderId)
        .eq('status', 'PAID')
        .limit(1)
        .maybeSingle()
      if (existingPaid.error) throw existingPaid.error
      let attemptId = existingPaid.data?.id
      if (!attemptId) {
        const amountVnd = Number(order.deposit_amount)
        if (!Number.isFinite(amountVnd) || amountVnd <= 0) throw new Error('Số tiền đặt cọc không hợp lệ.')

        const pending = await supabase
          .from('vnpay_deposit_attempts')
          .select('id')
          .eq('deposit_order_id', orderId)
          .eq('status', 'PENDING')
          .maybeSingle()
        if (pending.error) throw pending.error
        attemptId = pending.data?.id
        if (!attemptId) {
          const inserted = await supabase.from('vnpay_deposit_attempts').insert({
            deposit_order_id: orderId,
            transaction_reference: `DEBUG${Date.now()}${randomUUID().replaceAll('-', '').slice(0, 8)}`,
            order_number: order.order_number,
            amount_vnd: amountVnd,
          }).select('id').single()
          if (inserted.error?.code === '23505') {
            const retry = await supabase
              .from('vnpay_deposit_attempts')
              .select('id')
              .eq('deposit_order_id', orderId)
              .eq('status', 'PENDING')
              .maybeSingle()
            if (retry.error) throw retry.error
            attemptId = retry.data?.id
          } else if (inserted.error) {
            throw inserted.error
          } else {
            attemptId = inserted.data.id
          }
        }
      }

      if (!attemptId) throw new Error('Không thể tạo giao dịch cọc debug.')
      const now = new Date().toISOString()
      const { data: command, error: commandError } = await supabase.rpc('process_vnpay_deposit_callback', {
        p_attempt_id: attemptId,
        p_success: true,
        p_response_code: '00',
        p_transaction_no: createDebugVnpayTransactionNo(),
        p_bank_code: 'FASTLANE_DEBUG',
        p_response_payload: {
          source: 'ADMIN_DEBUG_ACTION',
          actorUserId: admin.id,
          warning: 'Synthetic payment evidence; non-production use only',
        },
        p_paid_at: now,
      }).single<{ outcome: string }>()
      if (commandError || !command) throw commandError || new Error('Không thể mô phỏng thanh toán cọc.')
    } else if (action === 'mock_confirm_order') {
      const { data: order, error: orderError } = await supabase
        .from('deposit_orders')
        .select('id,order_number,status,deposit_amount')
        .eq('id', orderId)
        .maybeSingle()
      if (orderError) throw orderError
      if (!order) throw new Error('Không tìm thấy đơn đặt cọc.')
      if (!['PENDING_DEPOSIT', 'PENDING', 'PENDING_CONFIRMATION'].includes(order.status)) {
        throw new Error('Đơn không còn ở giai đoạn chờ cọc.')
      }

      // Ensure paid status
      const existingPaid = await supabase
        .from('vnpay_deposit_attempts')
        .select('id')
        .eq('deposit_order_id', orderId)
        .eq('status', 'PAID')
        .limit(1)
        .maybeSingle()
      let attemptId = existingPaid.data?.id
      if (!attemptId) {
        const amountVnd = Number(order.deposit_amount)
        if (!Number.isFinite(amountVnd) || amountVnd <= 0) throw new Error('Số tiền đặt cọc không hợp lệ.')

        const pending = await supabase
          .from('vnpay_deposit_attempts')
          .select('id')
          .eq('deposit_order_id', orderId)
          .eq('status', 'PENDING')
          .maybeSingle()
        if (pending.error) throw pending.error
        attemptId = pending.data?.id
        if (!attemptId) {
          const inserted = await supabase.from('vnpay_deposit_attempts').insert({
            deposit_order_id: orderId,
            transaction_reference: `DEBUG${Date.now()}${randomUUID().replaceAll('-', '').slice(0, 8)}`,
            order_number: order.order_number,
            amount_vnd: amountVnd,
          }).select('id').single()
          attemptId = inserted.data?.id || ''
        }

        if (attemptId) {
          const now = new Date().toISOString()
          await supabase.rpc('process_vnpay_deposit_callback', {
            p_attempt_id: attemptId,
            p_success: true,
            p_response_code: '00',
            p_transaction_no: `DEBUG-${randomUUID()}`,
            p_bank_code: 'FASTLANE_DEBUG',
            p_response_payload: {
              source: 'ADMIN_DEBUG_ACTION',
              actorUserId: admin.id,
              warning: 'Synthetic payment evidence; non-production use only',
            },
            p_paid_at: now,
          })
        }
      }

      // Direct confirm
      const confirmed = await supabase.from('deposit_orders')
        .update({ status: 'CONFIRMED', payment: 'Paid', updated_at: new Date().toISOString() })
        .eq('id', orderId)
      if (confirmed.error) throw confirmed.error

      await tryAutoIssueContract(supabase, orderId)
    } else if (action === 'mock_kyc_approved') {
      const { data: order, error: orderError } = await supabase
        .from('deposit_orders')
        .select('id,status,kyc_status')
        .eq('id', orderId)
        .maybeSingle()
      if (orderError) throw orderError
      if (!order) throw new Error('Không tìm thấy đơn đặt cọc.')
      if (order.status !== 'CONFIRMED') {
        throw new Error('Đơn phải được duyệt tiền cọc trước khi mô phỏng KYC.')
      }

      if (order.kyc_status !== 'APPROVED') {
        const updated = await supabase.from('deposit_orders').update({
          kyc_status: 'APPROVED',
          kyc_session_id: `fastlane-admin-debug:${randomUUID()}`,
          updated_at: new Date().toISOString(),
        }).eq('id', orderId).eq('status', 'CONFIRMED')
        if (updated.error) throw updated.error
      }

      const issueResult = await tryAutoIssueContract(supabase, orderId)
      if (!issueResult.success) {
        throw new Error(issueResult.reason === 'NOT_READY'
          ? 'Đơn chưa đủ điều kiện phát hành tài liệu sau khi mô phỏng KYC.'
          : issueResult.error || 'Không thể phát hành tài liệu sau khi mô phỏng KYC.')
      }
    }

    revalidatePath('/admin/orders')
    revalidatePath('/profile')
    return { success: true }
  } catch (error) {
    const message = getDebugActionErrorMessage(error)
    const userMessage = message === 'DEPOSIT_DEBUG_ACTIONS_DISABLED'
      ? 'Thao tác debug đang bị tắt hoặc không được phép trên production.'
      : message
    return { success: false, error: userMessage }
  }
}
