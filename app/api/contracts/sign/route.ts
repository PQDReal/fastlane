import { NextResponse } from 'next/server'
import { createHash, randomUUID } from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getCurrentUser } from '@/lib/auth/current-user'
import { revalidatePath } from 'next/cache'
import { readRedisJson, deleteRedisKey } from '@/lib/redis'
import {
  CAR_SALES_CONSENT_VERSION,
  MOTORBIKE_SALES_CONSENT_VERSION,
} from '@/lib/deposit/contract-snapshot'
import { claimGuestDepositOrder, isSameDepositOwnerEmail } from '@/lib/deposit/order-ownership'

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (user.role !== 'CUSTOMER') {
      return NextResponse.json({ error: 'Chỉ khách hàng sở hữu đơn mới được xác nhận tài liệu đặt mua.' }, { status: 403 })
    }

    const body = await request.json()
    const { orderId, documentId, expectedContentHash, otp } = body

    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
    }
    if (!documentId || !expectedContentHash) {
      return NextResponse.json({ error: 'Thiếu thông tin phiên bản tài liệu.' }, { status: 400 })
    }

    if (!otp) {
      return NextResponse.json({ error: 'Thiếu mã xác thực OTP' }, { status: 400 })
    }

    // Verify OTP
    const redisKey = `otp:contract:sign:${orderId}`
    const storedOtp = await readRedisJson<string>(redisKey)

    // Fallback cho môi trường dev khi không cài Redis local
    if (process.env.NODE_ENV === 'development' && !storedOtp) {
      console.warn('[DEV] Redis is down or key not found. Bypassing OTP check.')
    } else {
      if (!storedOtp) {
        return NextResponse.json({ error: 'Mã OTP đã hết hạn hoặc không hợp lệ. Vui lòng gửi lại mã.' }, { status: 400 })
      }

      if (storedOtp !== otp) {
        return NextResponse.json({ error: 'Mã OTP không chính xác.' }, { status: 400 })
      }
    }
    
    await deleteRedisKey(redisKey)

    const supabase = getSupabaseAdmin()

    // Lấy thông tin order & deadline
    const { data: orderData, error: fetchError } = await supabase
      .from('deposit_orders')
      .select('id, customer_id, email, status, vehicle_type, contract_signed_at, contract_signature_due_at')
      .eq('id', orderId)
      .single()

    if (fetchError || !orderData) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (orderData.customer_id !== user.id && !isSameDepositOwnerEmail(orderData.email, user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    await claimGuestDepositOrder(supabase, orderData, { id: user.id, email: user.email })

    // Kiểm tra đã ký chưa
    if (orderData.contract_signed_at) {
      return NextResponse.json({ error: 'Tài liệu này đã được xác nhận trước đó.' }, { status: 400 })
    }

    // Kiểm tra trạng thái có cho phép ký không
    if (orderData.status !== 'PENDING_CONTRACT') {
      return NextResponse.json({ error: 'Đơn hàng không ở trạng thái chờ xác nhận tài liệu.' }, { status: 400 })
    }

    // Kiểm tra thời hạn ký
    if (!orderData.contract_signature_due_at) {
      return NextResponse.json({ error: 'Tài liệu chưa có thời hạn xác nhận hợp lệ.' }, { status: 409 })
    }
    const dueTime = new Date(orderData.contract_signature_due_at).getTime()
    if (!Number.isFinite(dueTime) || Date.now() >= dueTime) {
      return NextResponse.json({ error: 'Đã hết thời hạn 72 giờ để xác nhận tài liệu. Đơn hàng đang được hệ thống xử lý hủy.' }, { status: 409 })
    }

    const { data: document, error: documentError } = await supabase
      .from('deposit_order_documents')
      .select('id,content_hash,status,document_version,content_snapshot')
      .eq('id', documentId)
      .eq('deposit_order_id', orderId)
      .maybeSingle()
    if (documentError || !document || document.status !== 'PENDING_SIGNATURE' || document.content_hash !== expectedContentHash) {
      return NextResponse.json({ error: 'Phiên bản tài liệu đã thay đổi. Vui lòng tải lại trang.' }, { status: 409 })
    }

    const snapshotConsentVersion = document.content_snapshot
      && typeof document.content_snapshot === 'object'
      && 'consentVersion' in document.content_snapshot
      && typeof document.content_snapshot.consentVersion === 'string'
      ? document.content_snapshot.consentVersion
      : null
    const consentVersion = snapshotConsentVersion
      || (orderData.vehicle_type === 'motorbike' && document.document_version === '2026-08-07.1'
        ? 'motorbike-sales-consent-2026-08-07.1'
        : orderData.vehicle_type === 'motorbike'
          ? MOTORBIKE_SALES_CONSENT_VERSION
          : CAR_SALES_CONSENT_VERSION)

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'
    const signatureEvidence = {
      requestId: randomUUID(),
      signedByUserId: user.id,
      ipHash: createHash('sha256').update(clientIp).digest('hex'),
      userAgentHash: createHash('sha256').update(userAgent).digest('hex'),
    }

    const { data: signed, error: signError } = await supabase.rpc('sign_deposit_order_contract', {
      p_order_id: orderId,
      p_document_id: documentId,
      p_customer_id: user.id,
      p_expected_content_hash: expectedContentHash,
      p_consent_version: consentVersion,
      p_signature_method: 'ELECTRONIC_CONSENT',
      p_signature_evidence: signatureEvidence,
      p_event_key: `CONTRACT_SIGNED:${documentId}`,
    }).single<{ document_id: string; order_status: string; signed_at: string; replayed: boolean }>()

    if (signError || !signed) {
      console.error('Error signing contract:', signError)
      return NextResponse.json({ error: 'Không thể xác nhận tài liệu do trạng thái đơn đã thay đổi hoặc hết hạn.' }, { status: 409 })
    }

    revalidatePath('/profile')
    
    return NextResponse.json({ success: true, redirectUrl: '/profile?tab=car-orders' })
  } catch (error: any) {
    console.error('Error in sign contract API:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
