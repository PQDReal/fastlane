import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { updateDepositOrderWithKycFallback } from '@/lib/deposit/kyc-persistence'
import { revalidatePath } from 'next/cache'
import { verifyDiditWebhook } from '@/lib/didit/webhook'
import { tryAutoIssueContract } from '@/lib/deposit/contract-service'

export async function POST(request: Request) {
  try {
    const rawBody = await request.text()
    const verified = verifyDiditWebhook(
      rawBody,
      request.headers.get('x-signature'),
      request.headers.get('x-timestamp'),
    )
    if (!verified) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let payload: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(rawBody)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Webhook body must be an object')
      }
      payload = parsed as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 })
    }

    // Example payload from Didit Webhook:
    // { webhook_type: 'status.updated', status: 'Approved', session_id: '...', vendor_data: '...', ... }

    const webhookType = typeof payload.webhook_type === 'string' ? payload.webhook_type : ''
    const status = typeof payload.status === 'string' ? payload.status.toLowerCase() : ''
    const sessionId = typeof payload.session_id === 'string' ? payload.session_id : ''
    const orderId = typeof payload.vendor_data === 'string' ? payload.vendor_data : ''

    if (!sessionId || !orderId) {
      return NextResponse.json({ error: 'Missing sessionId or vendor_data' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: order, error: orderError } = await supabase
      .from('deposit_orders')
      .select('id,status,kyc_session_id,full_name,id_card_number')
      .eq('id', orderId)
      .maybeSingle<{
        id: string
        status: string
        kyc_session_id: string | null
        full_name: string | null
        id_card_number: string | null
      }>()
    if (orderError) throw orderError
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (!order.kyc_session_id || order.kyc_session_id !== sessionId) {
      return NextResponse.json({ success: true, ignored: true })
    }
    if (!['PENDING_CONFIRMATION', 'CONFIRMED'].includes(order.status)) {
      // Late webhook must not resurrect a cancelled/signed/paid order.
      return NextResponse.json({ success: true, ignored: true })
    }

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

        if (!verifiedName || !verifiedId) {
          await updateDepositOrderWithKycFallback(supabase, orderId, {
            kyc_status: 'DECLINED', kyc_session_id: sessionId, updated_at: new Date().toISOString(),
          })
          return NextResponse.json({ success: true, incomplete: true })
        }

        const normalize = (value: unknown) => String(value ?? '')
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '')
        if (verifiedName && verifiedId && (
          normalize(order.full_name) !== normalize(verifiedName)
          || normalize(order.id_card_number) !== normalize(verifiedId)
        )) {
          await updateDepositOrderWithKycFallback(supabase, orderId, {
            kyc_status: 'DECLINED', kyc_session_id: sessionId, updated_at: new Date().toISOString(),
          })
          return NextResponse.json({ success: true, mismatch: true })
        }

        const updatePayload: any = {
          kyc_status: 'APPROVED',
          kyc_session_id: sessionId,
          updated_at: new Date().toISOString()
        }

        if (verifiedName) updatePayload.full_name = verifiedName
        if (verifiedId) updatePayload.id_card_number = verifiedId

        await updateDepositOrderWithKycFallback(supabase, orderId, updatePayload)
        const issueResult = await tryAutoIssueContract(supabase, orderId)
        if (!issueResult.success && issueResult.reason !== 'NOT_READY') {
          console.error('Auto issue after Didit webhook failed', {
            orderId,
            reason: issueResult.reason,
            error: issueResult.error,
          })
        }
        console.log(`Order ${orderId} KYC approved via webhook.`)
      }

    } else if (webhookType === 'status.updated' && (status === 'declined' || status === 'rejected')) {
      // The admin manually declined the session
      await updateDepositOrderWithKycFallback(supabase, orderId, {
        kyc_status: 'DECLINED',
        kyc_session_id: sessionId,
        updated_at: new Date().toISOString()
      })
      console.log(`Order ${orderId} KYC declined via webhook.`)
    } else if (webhookType === 'status.updated' && (status === 'review' || status === 'manual_review')) {
      // Just in case it's triggered
      await updateDepositOrderWithKycFallback(supabase, orderId, {
        kyc_status: 'REVIEW',
        kyc_session_id: sessionId,
        updated_at: new Date().toISOString()
      })
    }

    revalidatePath('/admin/orders')
    revalidatePath('/profile')

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error handling Didit Webhook:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
