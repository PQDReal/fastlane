import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { revalidatePath } from 'next/cache'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { orderId, sessionId } = body

    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
    }

    let verifiedName = undefined
    let verifiedId = undefined

    if (sessionId) {
      try {
        const diditRes = await fetch(`https://verification.didit.me/v3/session/${sessionId}/decision/`, {
          headers: {
            'x-api-key': process.env.DIDIT_API_KEY as string
          }
        })
        if (diditRes.ok) {
          const decision = await diditRes.json()
          console.log('Didit Decision:', decision)
          
          const decisionStatus = (decision.status || '').toLowerCase()

          if (decisionStatus === 'review' || decisionStatus === 'manual_review') {
            return NextResponse.json({ error: 'Quá trình xác minh cần được nhân viên xét duyệt thủ công. Vui lòng chờ.' }, { status: 400 })
          } else if (decisionStatus === 'declined' || decisionStatus === 'rejected') {
            return NextResponse.json({ error: 'Xác minh thất bại. Vui lòng thử lại bằng CCCD hợp lệ.' }, { status: 400 })
          } else if (decisionStatus !== 'approved') {
            return NextResponse.json({ error: 'Trạng thái xác minh chưa hoàn tất hoặc không thành công.' }, { status: 400 })
          }

          const doc = decision.document || decision.person
          if (doc) {
            verifiedName = doc.first_name ? `${doc.first_name} ${doc.last_name || ''}`.trim() : undefined
            verifiedId = doc.document_number
          }
        } else {
          return NextResponse.json({ error: 'Không thể lấy kết quả từ Didit' }, { status: 400 })
        }
      } catch (err) {
        console.error('Failed to fetch Didit decision', err)
        return NextResponse.json({ error: 'Lỗi kết nối tới hệ thống xác minh' }, { status: 500 })
      }
    }

    const supabase = getSupabaseAdmin()

    // Fetch original order data for comparison
    const { data: orderData, error: fetchError } = await supabase
      .from('deposit_orders')
      .select('full_name, id_card_number')
      .eq('id', orderId)
      .single()

    if (fetchError || !orderData) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (verifiedName && verifiedId) {
      const normalize = (str: string) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '')
      
      const isNameMatch = normalize(orderData.full_name) === normalize(verifiedName)
      const isIdMatch = normalize(orderData.id_card_number) === normalize(verifiedId)

      if (!isNameMatch || !isIdMatch) {
        return NextResponse.json({ 
          error: 'Thông tin xác minh không khớp',
          mismatch: true,
          details: { nameMatch: isNameMatch, idMatch: isIdMatch }
        }, { status: 400 })
      }
    }

    const updatePayload: any = {
      status: 'PENDING_CONTRACT',
      updated_at: new Date().toISOString()
    }

    if (verifiedName) updatePayload.full_name = verifiedName
    if (verifiedId) updatePayload.id_card_number = verifiedId

    // Update order status to PENDING_CONTRACT after KYC is completed
    const { error } = await supabase
      .from('deposit_orders')
      .update(updatePayload)
      .eq('id', orderId)

    if (error) {
      console.error('Error updating order after KYC:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    revalidatePath('/profile')
    
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error completing KYC:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
