import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { revalidatePath } from 'next/cache'

export async function POST(request: Request) {
  try {
    const payload = await request.json()
    console.log('Didit Webhook Payload:', payload)

    // Example payload from Didit Webhook:
    // { webhook_type: 'status.updated', status: 'Approved', session_id: '...', vendor_data: '...', ... }

    const webhookType = payload.webhook_type
    const status = payload.status ? payload.status.toLowerCase() : ''
    const sessionId = payload.session_id
    const orderId = payload.vendor_data // We passed orderId in vendor_data

    if (!sessionId || !orderId) {
      return NextResponse.json({ error: 'Missing sessionId or vendor_data' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    if (webhookType === 'status.updated' && status === 'approved') {
      // The admin manually approved the session on Didit's Business Console
      // We must fetch the actual decision data to get the name and ID, similar to /api/kyc/complete
      const diditRes = await fetch(`https://verification.didit.me/v3/session/${sessionId}/decision/`, {
        headers: { 'x-api-key': process.env.DIDIT_API_KEY as string }
      })

      if (diditRes.ok) {
        const decision = await diditRes.json()
        const doc = decision.document || decision.person
        let verifiedName = undefined
        let verifiedId = undefined

        if (doc) {
          verifiedName = doc.first_name ? `${doc.first_name} ${doc.last_name || ''}`.trim() : undefined
          verifiedId = doc.document_number
        }

        const updatePayload: any = {
          status: 'PENDING_CONTRACT',
          updated_at: new Date().toISOString()
        }

        if (verifiedName) updatePayload.full_name = verifiedName
        if (verifiedId) updatePayload.id_card_number = verifiedId

        await supabase.from('deposit_orders').update(updatePayload).eq('id', orderId)
        console.log(`Order ${orderId} KYC approved via webhook.`)
      }

    } else if (webhookType === 'status.updated' && (status === 'declined' || status === 'rejected')) {
      // The admin manually declined the session
      await supabase.from('deposit_orders').update({
        updated_at: new Date().toISOString()
      }).eq('id', orderId)
      console.log(`Order ${orderId} KYC declined via webhook.`)
    } else if (webhookType === 'status.updated' && (status === 'review' || status === 'manual_review')) {
      // Just in case it's triggered
      await supabase.from('deposit_orders').update({
        updated_at: new Date().toISOString()
      }).eq('id', orderId)
    }

    revalidatePath('/admin/orders')
    revalidatePath('/profile')

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error handling Didit Webhook:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
