import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { updateDepositOrderWithKycFallback } from '@/lib/deposit/kyc-persistence'
import { revalidatePath } from 'next/cache'
import { requireCurrentCustomer } from '@/lib/api/customer'
import { ApiRouteError, apiErrorResponse } from '@/lib/api/errors'
import { tryAutoIssueContract } from '@/lib/deposit/contract-service'
import { assertFastlaneTestAllowed, buildFastlaneTestDecision, isFastlaneTestProvider } from '@/lib/deposit/kyc-provider'
import { claimGuestDepositOrder, isSameDepositOwnerEmail } from '@/lib/deposit/order-ownership'

function normalize(value: string | null | undefined) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '')
}

export async function POST(request: Request) {
  try {
    const customer = await requireCurrentCustomer()
    if (customer.role !== 'CUSTOMER') {
      throw new ApiRouteError(403, 'FORBIDDEN', 'Chỉ khách hàng mới được hoàn tất KYC.')
    }

    const body = await request.json()
    const { orderId, sessionId } = body
    if (!orderId) return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
    if (typeof sessionId !== 'string' || !sessionId.trim()) {
      throw new ApiRouteError(400, 'KYC_SESSION_REQUIRED', 'Thiếu phiên xác minh KYC hợp lệ.')
    }

    const supabase = getSupabaseAdmin()
    const { data: orderData, error: fetchError } = await supabase
      .from('deposit_orders')
      .select('id, status, customer_id, email, full_name, id_card_number, kyc_session_id')
      .eq('id', orderId)
      .single()

    if (fetchError || !orderData) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (orderData.customer_id !== customer.id && !isSameDepositOwnerEmail(orderData.email, customer.email)) {
      throw new ApiRouteError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy đơn đặt cọc.')
    }
    await claimGuestDepositOrder(supabase, orderData, customer)
    if (!['PENDING_CONFIRMATION', 'CONFIRMED'].includes(orderData.status)) {
      throw new ApiRouteError(409, 'INVALID_ORDER_STATE', 'Đơn đặt cọc chưa sẵn sàng để xác thực KYC.')
    }
    if (orderData.kyc_session_id !== sessionId) {
      throw new ApiRouteError(409, 'KYC_SESSION_MISMATCH', 'Phiên KYC không thuộc đơn đặt cọc này.')
    }

    let verifiedName: string | undefined
    let verifiedId: string | undefined

    try {
      if (isFastlaneTestProvider()) assertFastlaneTestAllowed()
      const decision = isFastlaneTestProvider()
        ? buildFastlaneTestDecision(orderData)
        : await (async () => {
          const diditRes = await fetch(`https://verification.didit.me/v3/session/${sessionId}/decision/`, {
            headers: { 'x-api-key': process.env.DIDIT_API_KEY as string },
          })
          if (!diditRes.ok) throw new Error('DIDIT_DECISION_FAILED')
          return diditRes.json()
        })()
      const decisionStatus = String(decision.status || '').toLowerCase()

      if (decisionStatus === 'review' || decisionStatus === 'manual_review' || decisionStatus === 'in review' || decisionStatus === 'in_review') {
        await updateDepositOrderWithKycFallback(supabase, orderId, {
          kyc_status: 'REVIEW', kyc_session_id: sessionId, updated_at: new Date().toISOString(),
        })
        return NextResponse.json({
          success: true,
          status: 'REVIEW',
          message: 'Quá trình xác minh cần được nhân viên xét duyệt thủ công. Vui lòng chờ.'
        })
      }
      if (decisionStatus === 'declined' || decisionStatus === 'rejected' || decisionStatus === 'resubmitted') {
        await updateDepositOrderWithKycFallback(supabase, orderId, {
          kyc_status: 'DECLINED', kyc_session_id: sessionId, updated_at: new Date().toISOString(),
        })
        return NextResponse.json({ error: 'Xác minh thất bại. Vui lòng thử lại bằng CCCD hợp lệ.' }, { status: 400 })
      }
      if (decisionStatus !== 'approved') {
        return NextResponse.json({ error: 'Trạng thái xác minh chưa hoàn tất hoặc không thành công.' }, { status: 400 })
      }

      const doc = decision.document || decision.person
      if (doc) {
        verifiedName = doc.first_name ? `${doc.first_name} ${doc.last_name || ''}`.trim() : undefined
        verifiedId = typeof doc.document_number === 'string' ? doc.document_number : undefined
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'DIDIT_DECISION_FAILED') {
        return NextResponse.json({ error: 'Không thể lấy kết quả từ Didit' }, { status: 400 })
      }
      console.error('Failed to fetch Didit decision', error instanceof Error ? error.message : 'unknown error')
      return NextResponse.json({ error: 'Lỗi kết nối tới hệ thống xác minh' }, { status: 500 })
    }

    if (!verifiedName || !verifiedId) {
      return NextResponse.json({ error: 'Didit không trả về đủ thông tin định danh.' }, { status: 400 })
    }
    const nameMatch = normalize(orderData.full_name) === normalize(verifiedName)
    const idMatch = normalize(orderData.id_card_number) === normalize(verifiedId)
    if (!nameMatch || !idMatch) {
      return NextResponse.json({
        error: 'Thông tin xác minh không khớp',
        mismatch: true,
        details: { nameMatch, idMatch },
      }, { status: 400 })
    }

    const updatePayload: Record<string, unknown> = {
      kyc_status: 'APPROVED',
      kyc_session_id: sessionId,
      updated_at: new Date().toISOString(),
    }
    if (verifiedName) updatePayload.full_name = verifiedName
    if (verifiedId) updatePayload.id_card_number = verifiedId

    const { error } = await updateDepositOrderWithKycFallback(supabase, orderId, updatePayload)
    if (error) {
      console.error('Error updating order after KYC:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const issueResult = await tryAutoIssueContract(supabase, orderId)
    if (!issueResult.success && issueResult.reason !== 'NOT_READY') {
      console.error('Auto issue after KYC approval failed', {
        orderId,
        reason: issueResult.reason,
        error: issueResult.error,
      })
    }

    revalidatePath('/profile')
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error completing KYC:', error instanceof Error ? error.message : 'unknown error')
    return apiErrorResponse(error)
  }
}
