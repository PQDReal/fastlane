import { NextResponse } from 'next/server'
import { createHash, randomUUID } from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getCurrentUser } from '@/lib/auth/current-user'
import { revalidatePath } from 'next/cache'
import { deleteRedisKey, incrementRedisCounter, readRedisJson } from '@/lib/redis'
import {
  CAR_SALES_CONSENT_VERSION,
  MOTORBIKE_SALES_CONSENT_VERSION,
} from '@/lib/deposit/contract-snapshot'
import {
  contractOtpAttemptKey,
  contractOtpKey,
  resolveContractOtpSecret,
  verifyContractOtpRecord,
  type ContractOtpBinding,
  type ContractOtpRecord,
} from '@/lib/deposit/contract-otp'
import { claimGuestDepositOrder, isSameDepositOwnerEmail } from '@/lib/deposit/order-ownership'

const OTP_ATTEMPT_WINDOW_SECONDS = 5 * 60
const OTP_MAX_ATTEMPTS = 5
const CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (user.role !== 'CUSTOMER') {
      return NextResponse.json({ error: 'Chỉ khách hàng sở hữu đơn mới được xác nhận tài liệu đặt mua.' }, { status: 403 })
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const orderId = typeof body?.orderId === 'string' ? body.orderId : ''
    const documentId = typeof body?.documentId === 'string' ? body.documentId : ''
    const expectedContentHash = typeof body?.expectedContentHash === 'string' ? body.expectedContentHash : ''
    const otp = typeof body?.otp === 'string' ? body.otp : ''

    if (!orderId || !documentId || !CONTENT_HASH_PATTERN.test(expectedContentHash)) {
      return NextResponse.json({ error: 'Thiếu thông tin phiên bản tài liệu.' }, { status: 400 })
    }
    if (!/^\d{6}$/.test(otp)) {
      return NextResponse.json({ error: 'Thiếu mã xác thực OTP' }, { status: 400 })
    }

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

    const secret = resolveContractOtpSecret()
    if (!secret) {
      console.error('[contract-otp] Missing CONTRACT_OTP_SECRET or valid AUTH0_SECRET')
      return NextResponse.json({ error: 'Dịch vụ xác thực OTP tạm thời chưa sẵn sàng.' }, { status: 503 })
    }
    const otpBinding: ContractOtpBinding = {
      customerId: user.id,
      orderId,
      documentId,
      contentHash: expectedContentHash,
    }
    const otpKey = contractOtpKey(otpBinding)
    const attemptKey = contractOtpAttemptKey(otpBinding)
    const otpRecord = await readRedisJson<ContractOtpRecord>(otpKey)
    if (!otpRecord) {
      return NextResponse.json({ error: 'Mã OTP đã hết hạn hoặc không hợp lệ. Vui lòng gửi lại mã.' }, { status: 400 })
    }
    if (!verifyContractOtpRecord(otpRecord, otpBinding, otp, secret)) {
      const attempts = await incrementRedisCounter(attemptKey, OTP_ATTEMPT_WINDOW_SECONDS)
      if (attempts === null) {
        return NextResponse.json({ error: 'Dịch vụ xác thực OTP tạm thời chưa sẵn sàng.' }, { status: 503 })
      }
      if (attempts >= OTP_MAX_ATTEMPTS) await deleteRedisKey(otpKey)
      return NextResponse.json({
        error: attempts >= OTP_MAX_ATTEMPTS
          ? 'Mã OTP đã bị khóa do nhập sai quá nhiều lần. Vui lòng yêu cầu mã mới.'
          : 'Mã OTP không chính xác.',
      }, { status: 400 })
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
      otpVerified: true,
      otpIssuedAt: otpRecord.issuedAt,
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

    await Promise.all([deleteRedisKey(otpKey), deleteRedisKey(attemptKey)])

    revalidatePath('/profile')
    
    return NextResponse.json({ success: true, redirectUrl: '/profile?tab=car-orders' })
  } catch (error) {
    console.error('Error in sign contract API:', error instanceof Error ? error.message : 'unknown error')
    return NextResponse.json({ error: 'Không thể xác nhận tài liệu lúc này.' }, { status: 500 })
  }
}
