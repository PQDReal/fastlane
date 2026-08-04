import { NextResponse } from 'next/server'

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

    // Database tracking disabled: the schema lacks kyc_session_id and kyc_status columns.
    
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
