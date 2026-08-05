import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { updateDepositOrderWithKycFallback } from '@/lib/deposit/kyc-persistence'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { orderId, customerName, customerId } = body

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

      // The verification session remains usable before migration 036 is run.
      // Do not discard a successfully-created Didit session solely because an
      // older database schema cannot persist its tracking fields yet.
      if (trackingError) {
        console.error('Unable to persist Didit session:', {
          code: trackingError.code,
          message: trackingError.message,
          details: trackingError.details,
          hint: trackingError.hint,
        })
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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
