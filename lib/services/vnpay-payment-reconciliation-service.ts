import 'server-only'

import {
  createVnPayPipeHash,
  verifyVnPayPipeHash,
  vnPayConfig,
  vnPayDate,
  vnPayTransactionOutcome,
  VNPAY_PAYMENT_EXPIRY_MS,
  type VnPayParams,
} from '@/lib/payments/vnpay'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type PaymentAttemptKind = 'accessory' | 'deposit'
type PaymentAttemptStatus = 'PENDING' | 'PAID' | 'FAILED'

type PaymentAttempt = {
  id: string
  order_id?: string
  deposit_order_id?: string
  transaction_reference: string
  order_number: string
  amount_vnd: number | string
  status: PaymentAttemptStatus
  created_at: string
}

export type VnPayPaymentReconciliationResult = {
  status: PaymentAttemptStatus | 'ERROR'
  orderId: string
  orderKind: PaymentAttemptKind
  transactionReference: string
  message: string
  reason?: 'QUERY_TOO_SOON'
}

export class VnPayPaymentReconciliationError extends Error {
  constructor(message: string, public readonly code = 'VNPAY_PAYMENT_RECONCILIATION_FAILED') {
    super(message)
    this.name = 'VnPayPaymentReconciliationError'
  }
}

/** A newly-created attempt is not queried immediately; VNPay may still be opening it. */
export const PAYMENT_RECONCILIATION_MIN_AGE_MS = 2 * 60_000
const ATTEMPT_COLUMNS = 'id,order_id,transaction_reference,order_number,amount_vnd,status,created_at'
const DEPOSIT_ATTEMPT_COLUMNS = 'id,deposit_order_id,transaction_reference,order_number,amount_vnd,status,created_at'

const normalizeIp = (ip: string) => !ip || ip === '::1' ? '127.0.0.1' : ip.replace(/^::ffff:/, '')

function responseParams(value: unknown): VnPayParams {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new VnPayPaymentReconciliationError('VNPay trả về dữ liệu đối soát không hợp lệ.', 'INVALID_VNPAY_RESPONSE')
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item ?? '')]))
}

function verifyApiResponse(response: VnPayParams, secret: string) {
  const common = [
    response.vnp_ResponseId || '', response.vnp_Command || '', response.vnp_ResponseCode || '', response.vnp_Message || '',
    response.vnp_TmnCode || '', response.vnp_TxnRef || '', response.vnp_Amount || '', response.vnp_BankCode || '',
    response.vnp_PayDate || '', response.vnp_TransactionNo || '', response.vnp_TransactionType || '',
    response.vnp_TransactionStatus || '', response.vnp_OrderInfo || '',
  ]
  const values = response.vnp_Command === 'querydr'
    ? [...common, response.vnp_PromotionCode || '', response.vnp_PromotionAmount || '']
    : common
  return verifyVnPayPipeHash(values, response.vnp_SecureHash, secret)
}

function orderIdOf(attempt: PaymentAttempt, kind: PaymentAttemptKind) {
  return kind === 'deposit' ? attempt.deposit_order_id : attempt.order_id
}

function statusMessage(status: PaymentAttemptStatus | 'ERROR') {
  if (status === 'PAID') return 'Thanh toán VNPay đã được xác nhận.'
  if (status === 'FAILED') return 'VNPay xác nhận giao dịch không thành công hoặc đã bị hủy.'
  if (status === 'ERROR') return 'Không thể đối soát thanh toán VNPay lúc này.'
  return 'Chưa có kết quả cuối cùng từ VNPay. Hệ thống sẽ tiếp tục xác minh.'
}

async function queryVnPay(attempt: PaymentAttempt, clientIp: string) {
  const config = vnPayConfig()
  const now = new Date()
  const requestId = crypto.randomUUID().replaceAll('-', '').slice(0, 32)
  const params: VnPayParams = {
    vnp_RequestId: requestId,
    vnp_Version: '2.1.0',
    vnp_Command: 'querydr',
    vnp_TmnCode: config.tmnCode,
    vnp_TxnRef: attempt.transaction_reference,
    vnp_TransactionDate: vnPayDate(new Date(attempt.created_at)),
    vnp_CreateDate: vnPayDate(now),
    vnp_IpAddr: normalizeIp(clientIp),
    vnp_OrderInfo: `Kiem tra thanh toan ${attempt.order_number}`,
  }
  params.vnp_SecureHash = createVnPayPipeHash([
    params.vnp_RequestId,
    params.vnp_Version,
    params.vnp_Command,
    params.vnp_TmnCode,
    params.vnp_TxnRef,
    params.vnp_TransactionDate,
    params.vnp_CreateDate,
    params.vnp_IpAddr,
    params.vnp_OrderInfo,
  ], config.hashSecret)

  let response: VnPayParams
  try {
    const result = await fetch(config.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      cache: 'no-store',
    })
    if (!result.ok) throw new Error(`VNPay HTTP ${result.status}`)
    response = responseParams(await result.json())
  } catch (error) {
    throw new VnPayPaymentReconciliationError(
      error instanceof Error ? `Không thể gọi querydr VNPay: ${error.message}` : 'Không thể gọi querydr VNPay.',
      'VNPAY_QUERY_FAILED',
    )
  }

  // VNPay sandbox can return an unsigned, minimal response when querydr is
  // repeated inside its five-minute limit. This is a retryable state, not a
  // response-signature failure.
  if (response.vnp_ResponseCode === '94' && !response.vnp_SecureHash) {
    return response
  }

  if (!verifyApiResponse(response, config.hashSecret)) {
    throw new VnPayPaymentReconciliationError('Chữ ký phản hồi querydr VNPay không hợp lệ.', 'INVALID_VNPAY_RESPONSE_SIGNATURE')
  }
  if (response.vnp_TmnCode !== config.tmnCode || response.vnp_TxnRef !== attempt.transaction_reference) {
    throw new VnPayPaymentReconciliationError('Phản hồi querydr không khớp giao dịch đang xác minh.', 'VNPAY_RESPONSE_MISMATCH')
  }
  if (response.vnp_Command !== 'querydr') {
    throw new VnPayPaymentReconciliationError('VNPay trả về sai loại phản hồi đối soát.', 'INVALID_VNPAY_RESPONSE_COMMAND')
  }
  if (response.vnp_Amount && Number(response.vnp_Amount) !== Math.round(Number(attempt.amount_vnd) * 100)) {
    throw new VnPayPaymentReconciliationError('Số tiền phản hồi VNPay không khớp đơn hàng.', 'VNPAY_AMOUNT_MISMATCH')
  }
  return response
}

async function applyPaymentResult(
  attempt: PaymentAttempt,
  kind: PaymentAttemptKind,
  response: VnPayParams,
  success: boolean,
) {
  const supabase = getSupabaseAdmin()
  const orderId = orderIdOf(attempt, kind)
  const responseCode = success ? '00' : response.vnp_TransactionStatus || response.vnp_ResponseCode || '99'
  const now = new Date().toISOString()

  if (kind === 'deposit') {
    const command = await supabase.rpc('process_vnpay_deposit_callback', {
      p_attempt_id: attempt.id,
      p_success: success,
      p_response_code: responseCode,
      p_transaction_no: response.vnp_TransactionNo || '',
      p_bank_code: response.vnp_BankCode || '',
      p_response_payload: response,
      p_paid_at: success ? now : null,
    }).single<{ outcome?: string; attempt_status?: PaymentAttemptStatus }>()
    if (command.error || !command.data) throw command.error || new Error('Không thể ghi nhận kết quả thanh toán đặt cọc.')
  } else {
    if (success) {
      const orderUpdate = await supabase.from('orders').update({ status: 'PAID', updated_at: now })
        .eq('id', orderId).eq('status', 'PENDING')
      if (orderUpdate.error) throw orderUpdate.error
    }
    const attemptUpdate = await supabase.from('vnpay_checkout_attempts').update({
      status: success ? 'PAID' : 'FAILED',
      response_code: responseCode,
      vnpay_transaction_no: response.vnp_TransactionNo || null,
      bank_code: response.vnp_BankCode || null,
      paid_at: success ? now : null,
      updated_at: now,
    }).eq('id', attempt.id).eq('status', 'PENDING')
    if (attemptUpdate.error) throw attemptUpdate.error
  }
}

async function reconcileAttempt(
  attempt: PaymentAttempt,
  kind: PaymentAttemptKind,
  clientIp: string,
): Promise<VnPayPaymentReconciliationResult> {
  const orderId = orderIdOf(attempt, kind)
  if (!orderId) throw new VnPayPaymentReconciliationError('Attempt không liên kết với đơn hàng.', 'ATTEMPT_ORDER_NOT_FOUND')
  if (attempt.status !== 'PENDING') {
    return { status: attempt.status, orderId, orderKind: kind, transactionReference: attempt.transaction_reference, message: statusMessage(attempt.status) }
  }

  const response = await queryVnPay(attempt, clientIp)
  const isExpired = Date.now() - new Date(attempt.created_at).getTime() >= VNPAY_PAYMENT_EXPIRY_MS

  if (response.vnp_ResponseCode === '94') {
    return {
      status: 'PENDING',
      orderId,
      orderKind: kind,
      transactionReference: attempt.transaction_reference,
      reason: 'QUERY_TOO_SOON',
      message: 'VNPay giới hạn mỗi giao dịch chỉ được kiểm tra một lần trong 5 phút. Giao dịch vẫn đang chờ xác minh; vui lòng thử lại sau khi đủ 5 phút kể từ lần kiểm tra gần nhất.',
    }
  }

  if (response.vnp_ResponseCode !== '00') {
    return { status: 'PENDING', orderId, orderKind: kind, transactionReference: attempt.transaction_reference, message: statusMessage('PENDING') }
  }
  if (response.vnp_TransactionType && response.vnp_TransactionType !== '01') {
    return { status: 'PENDING', orderId, orderKind: kind, transactionReference: attempt.transaction_reference, message: 'VNPay chưa trả về trạng thái thanh toán của giao dịch.' }
  }

  const transactionStatus = response.vnp_TransactionStatus || ''
  const outcome = vnPayTransactionOutcome(transactionStatus)
  if (outcome === 'PENDING') {
    if (isExpired) {
      // Status 01 means an unfinished payment and becomes a failure after the
      // checkout window. Other pending codes belong to refund processing and
      // must not overwrite the original payment result.
      if (transactionStatus === '01') {
        await applyPaymentResult(attempt, kind, response, false)
        return { status: 'FAILED', orderId, orderKind: kind, transactionReference: attempt.transaction_reference, message: statusMessage('FAILED') }
      }
    }
    return { status: 'PENDING', orderId, orderKind: kind, transactionReference: attempt.transaction_reference, message: statusMessage('PENDING') }
  }
  const success = outcome === 'PAID'
  await applyPaymentResult(attempt, kind, response, success)
  const status: PaymentAttemptStatus = success ? 'PAID' : 'FAILED'
  return { status, orderId, orderKind: kind, transactionReference: attempt.transaction_reference, message: statusMessage(status) }
}

async function findPendingAttempt(orderId: string, kind: PaymentAttemptKind) {
  const table = kind === 'deposit' ? 'vnpay_deposit_attempts' : 'vnpay_checkout_attempts'
  const column = kind === 'deposit' ? 'deposit_order_id' : 'order_id'
  const columns = kind === 'deposit' ? DEPOSIT_ATTEMPT_COLUMNS : ATTEMPT_COLUMNS
  const result = await getSupabaseAdmin().from(table).select(columns)
    .eq(column, orderId).eq('status', 'PENDING').order('created_at', { ascending: false }).limit(1).maybeSingle<PaymentAttempt>()
  if (result.error) throw result.error
  return result.data
}

export async function reconcileVnPayPayment(input: {
  orderId: string
  orderKind: PaymentAttemptKind
  clientIp: string
}) {
  const attempt = await findPendingAttempt(input.orderId, input.orderKind)
  if (!attempt) {
    return {
      status: 'PENDING' as const,
      orderId: input.orderId,
      orderKind: input.orderKind,
      transactionReference: '',
      message: 'Không còn attempt PENDING để đối soát. Hãy tải lại đơn hàng.',
    }
  }
  return reconcileAttempt(attempt, input.orderKind, input.clientIp)
}

export async function reconcileVnPayPaymentAttempt(input: {
  attemptId: string
  orderKind: PaymentAttemptKind
  clientIp: string
}) {
  const table = input.orderKind === 'deposit' ? 'vnpay_deposit_attempts' : 'vnpay_checkout_attempts'
  const columns = input.orderKind === 'deposit' ? DEPOSIT_ATTEMPT_COLUMNS : ATTEMPT_COLUMNS
  const result = await getSupabaseAdmin().from(table).select(columns)
    .eq('id', input.attemptId).maybeSingle<PaymentAttempt>()
  if (result.error) throw result.error
  if (!result.data) {
    throw new VnPayPaymentReconciliationError('Không tìm thấy giao dịch VNPay cần đối soát.', 'ATTEMPT_NOT_FOUND')
  }
  return reconcileAttempt(result.data, input.orderKind, input.clientIp)
}

export async function reconcilePendingVnPayPayments(input: {
  limit?: number
  clientIp: string
}) {
  const limit = Math.max(1, Math.min(input.limit ?? 50, 100))
  const cutoff = new Date(Date.now() - PAYMENT_RECONCILIATION_MIN_AGE_MS).toISOString()
  const supabase = getSupabaseAdmin()
  const [accessory, deposit] = await Promise.all([
    supabase.from('vnpay_checkout_attempts').select(ATTEMPT_COLUMNS)
      .eq('status', 'PENDING').lt('created_at', cutoff).order('created_at', { ascending: true }).limit(limit).returns<PaymentAttempt[]>(),
    supabase.from('vnpay_deposit_attempts').select(DEPOSIT_ATTEMPT_COLUMNS)
      .eq('status', 'PENDING').lt('created_at', cutoff).order('created_at', { ascending: true }).limit(limit).returns<PaymentAttempt[]>(),
  ])
  if (accessory.error) throw accessory.error
  if (deposit.error) throw deposit.error
  const attempts = [
    ...(accessory.data ?? []).map((attempt) => ({ attempt, kind: 'accessory' as const })),
    ...(deposit.data ?? []).map((attempt) => ({ attempt, kind: 'deposit' as const })),
  ].sort((a, b) => a.attempt.created_at.localeCompare(b.attempt.created_at)).slice(0, limit)

  const results: Array<VnPayPaymentReconciliationResult> = []
  for (const item of attempts) {
    try {
      results.push(await reconcileAttempt(item.attempt, item.kind, input.clientIp))
    } catch (error) {
      const orderId = orderIdOf(item.attempt, item.kind) || ''
      results.push({
        status: 'ERROR', orderId, orderKind: item.kind,
        transactionReference: item.attempt.transaction_reference,
        message: error instanceof Error ? error.message : 'Không thể đối soát attempt VNPay.',
      })
    }
  }
  return results
}
