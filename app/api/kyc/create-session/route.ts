import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { updateDepositOrderWithKycFallback } from '@/lib/deposit/kyc-persistence'
import { requireCurrentCustomer } from '@/lib/api/customer'
import { ApiRouteError, apiErrorResponse } from '@/lib/api/errors'
import { createFastlaneTestSession, isFastlaneTestProvider } from '@/lib/deposit/kyc-provider'
import { claimGuestDepositOrder, isSameDepositOwnerEmail } from '@/lib/deposit/order-ownership'

export async function POST(request: Request) {
  try {
    const customer = await requireCurrentCustomer()
    if (customer.role !== 'CUSTOMER') {
      throw new ApiRouteError(403, 'FORBIDDEN', 'Chỉ khách hàng mới được tạo phiên KYC.')
    }
    const body = await request.json()
    const { orderId, customerName, customerId } = body

    const { data: order, error: orderError } = await getSupabaseAdmin()
      .from('deposit_orders')
      .select('id,customer_id,email,status,kyc_status')
      .eq('id', orderId)
      .maybeSingle<{ id: string; customer_id: string | null; email: string | null; status: string; kyc_status: string | null }>()
    if (orderError) throw orderError
    if (!order || (order.customer_id !== customer.id && !isSameDepositOwnerEmail(order.email, customer.email))) {
      throw new ApiRouteError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy đơn đặt cọc.')
    }
    await claimGuestDepositOrder(getSupabaseAdmin(), order, customer)
    if (!['PENDING_CONFIRMATION', 'CONFIRMED'].includes(order.status)) {
      throw new ApiRouteError(409, 'INVALID_ORDER_STATE', 'Đơn đặt cọc chưa sẵn sàng để xác thực KYC.')
    }
    if (order.kyc_status === 'APPROVED') {
      throw new ApiRouteError(409, 'KYC_ALREADY_APPROVED', 'Đơn đặt cọc đã hoàn tất xác minh KYC.')
    }

    const { data: paidAttempt, error: paidError } = await getSupabaseAdmin()
      .from('vnpay_deposit_attempts')
      .select('id')
      .eq('deposit_order_id', orderId)
      .eq('status', 'PAID')
      .limit(1)
      .maybeSingle()
    if (paidError) throw paidError
    if (!paidAttempt) {
      throw new ApiRouteError(409, 'DEPOSIT_NOT_PAID', 'Khoản cọc chưa được xác nhận thanh toán.')
    }

    if (isFastlaneTestProvider()) {
      const sessionId = createFastlaneTestSession()
      const { error: trackingError } = await updateDepositOrderWithKycFallback(
        getSupabaseAdmin(), orderId, {
          kyc_session_id: sessionId, kyc_status: 'PENDING', updated_at: new Date().toISOString(),
        },
      )
      if (trackingError) throw trackingError
      return NextResponse.json({ success: true, provider: 'fastlane-test', mock: true, sessionId })
    }

    const diditApiKey = process.env.DIDIT_API_KEY
    const workflowId = process.env.DIDIT_WORKFLOW_ID

    if (!diditApiKey || !workflowId) {
      return NextResponse.json(
        { error: 'Chưa cấu hình DIDIT_API_KEY hoặc DIDIT_WORKFLOW_ID trong .env.local' },
        { status: 500 }
      )
    }

    // Call Didit API to create a verification session
    const response = await fetch('https://verification.didit.me/v3/session/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': diditApiKey,
      },
      body: JSON.stringify({
        vendor_data: orderId, // Can be used to track the session in webhooks
        workflow_id: workflowId,
        language: 'vi', // Force Vietnamese language
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Didit API Error:', response.status, errorText)
      return NextResponse.json(
        { error: 'Không thể tạo phiên xác thực từ Didit', details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    const sessionId = data.session_id

    if (sessionId) {
      const { error: trackingError } = await updateDepositOrderWithKycFallback(
        getSupabaseAdmin(),
        orderId,
        {
          kyc_session_id: sessionId,
          kyc_status: 'PENDING',
          updated_at: new Date().toISOString(),
        },
      )

      if (trackingError) {
        console.error('Unable to persist Didit session:', {
          code: trackingError.code,
          message: trackingError.message,
          details: trackingError.details,
          hint: trackingError.hint,
        })
        return NextResponse.json({ error: 'Không thể lưu phiên KYC cho đơn đặt cọc.' }, { status: 503 })
      }
    }
    
    // didit v3 session API usually returns { url: '...' } or { session_id: '...' }
    return NextResponse.json({
      url: data.url,
      sessionId: sessionId,
      success: true
    })
    
  } catch (error: any) {
    console.error('Error creating Didit KYC session:', error)
    return apiErrorResponse(error)
  }
}
