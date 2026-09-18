import { NextResponse } from 'next/server'

import {
  contractOtpAttemptKey,
  contractOtpCooldownKey,
  contractOtpHourlyLimitKey,
  contractOtpKey,
  createContractOtpCode,
  createContractOtpRecord,
  resolveContractOtpSecret,
  type ContractOtpBinding,
} from '@/lib/deposit/contract-otp'
import { claimGuestDepositOrder, isSameDepositOwnerEmail } from '@/lib/deposit/order-ownership'
import { getCurrentUser } from '@/lib/auth/current-user'
import { sendEmailOTP } from '@/lib/mailer'
import {
  deleteRedisKey,
  incrementRedisCounter,
  writeRedisJson,
  writeRedisJsonIfAbsent,
} from '@/lib/redis'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const OTP_TTL_SECONDS = 5 * 60
const OTP_RESEND_COOLDOWN_SECONDS = 60
const OTP_HOURLY_LIMIT_SECONDS = 60 * 60
const OTP_MAX_SENDS_PER_HOUR = 5
const CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/

function serviceUnavailable() {
  return NextResponse.json(
    { error: 'Dịch vụ xác thực OTP tạm thời chưa sẵn sàng. Vui lòng thử lại sau.' },
    { status: 503 },
  )
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (user.role !== 'CUSTOMER') {
      return NextResponse.json({ error: 'Chỉ khách hàng sở hữu đơn mới được yêu cầu OTP.' }, { status: 403 })
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const orderId = typeof body?.orderId === 'string' ? body.orderId : ''
    const documentId = typeof body?.documentId === 'string' ? body.documentId : ''
    const expectedContentHash = typeof body?.expectedContentHash === 'string' ? body.expectedContentHash : ''
    if (!orderId || !documentId || !CONTENT_HASH_PATTERN.test(expectedContentHash)) {
      return NextResponse.json({ error: 'Thiếu thông tin phiên bản tài liệu hợp lệ.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: order, error: orderError } = await supabase
      .from('deposit_orders')
      .select('id,customer_id,email,status,vehicle_type,contract_signature_due_at')
      .eq('id', orderId)
      .maybeSingle()
    if (orderError) throw orderError
    if (!order || (order.customer_id !== user.id && !isSameDepositOwnerEmail(order.email, user.email))) {
      return NextResponse.json({ error: 'Không tìm thấy đơn đặt cọc.' }, { status: 404 })
    }
    await claimGuestDepositOrder(supabase, order, { id: user.id, email: user.email })

    if (order.status !== 'PENDING_CONTRACT') {
      return NextResponse.json({ error: 'Đơn không còn ở trạng thái chờ xác nhận tài liệu.' }, { status: 409 })
    }
    const dueAt = order.contract_signature_due_at ? new Date(order.contract_signature_due_at).getTime() : Number.NaN
    if (!Number.isFinite(dueAt) || Date.now() >= dueAt) {
      return NextResponse.json({ error: 'Tài liệu đã hết thời hạn xác nhận.' }, { status: 409 })
    }

    const { data: document, error: documentError } = await supabase
      .from('deposit_order_documents')
      .select('id,status,content_hash')
      .eq('id', documentId)
      .eq('deposit_order_id', orderId)
      .maybeSingle()
    if (documentError) throw documentError
    if (!document || document.status !== 'PENDING_SIGNATURE' || document.content_hash !== expectedContentHash) {
      return NextResponse.json({ error: 'Phiên bản tài liệu đã thay đổi. Vui lòng tải lại trang.' }, { status: 409 })
    }

    const secret = resolveContractOtpSecret()
    if (!secret) {
      console.error('[contract-otp] Missing CONTRACT_OTP_SECRET or valid AUTH0_SECRET')
      return serviceUnavailable()
    }

    const binding: ContractOtpBinding = {
      customerId: user.id,
      orderId,
      documentId,
      contentHash: expectedContentHash,
    }
    const cooldownKey = contractOtpCooldownKey(binding)
    const cooldown = await writeRedisJsonIfAbsent(cooldownKey, { issuedAt: new Date().toISOString() }, OTP_RESEND_COOLDOWN_SECONDS)
    if (cooldown === 'unavailable') return serviceUnavailable()
    if (cooldown === 'exists') {
      return NextResponse.json({ error: 'Vui lòng chờ trước khi yêu cầu gửi lại mã OTP.' }, { status: 429 })
    }

    const hourlyCount = await incrementRedisCounter(contractOtpHourlyLimitKey(binding), OTP_HOURLY_LIMIT_SECONDS)
    if (hourlyCount === null) {
      await deleteRedisKey(cooldownKey)
      return serviceUnavailable()
    }
    if (hourlyCount > OTP_MAX_SENDS_PER_HOUR) {
      await deleteRedisKey(cooldownKey)
      return NextResponse.json({ error: 'Bạn đã yêu cầu quá nhiều mã OTP. Vui lòng thử lại sau.' }, { status: 429 })
    }

    const otp = createContractOtpCode()
    const otpKey = contractOtpKey(binding)
    const stored = await writeRedisJson(
      otpKey,
      createContractOtpRecord(binding, otp, secret),
      OTP_TTL_SECONDS,
    )
    if (!stored) {
      await deleteRedisKey(cooldownKey)
      return serviceUnavailable()
    }
    await deleteRedisKey(contractOtpAttemptKey(binding))

    try {
      await sendEmailOTP(
        order.email,
        otp,
        order.vehicle_type === 'motorbike'
          ? 'Mã OTP xác nhận thỏa thuận đặt mua'
          : 'Mã OTP ký hợp đồng mua xe',
      )
    } catch (error) {
      await Promise.all([deleteRedisKey(otpKey), deleteRedisKey(cooldownKey)])
      throw error
    }

    return NextResponse.json({ success: true, message: 'Mã OTP đã được gửi.' })
  } catch (error) {
    console.error('[contract-otp] Unable to send OTP:', error instanceof Error ? error.message : 'unknown error')
    return NextResponse.json(
      { error: 'Không thể gửi mã OTP. Vui lòng thử lại sau.' },
      { status: 500 },
    )
  }
}
