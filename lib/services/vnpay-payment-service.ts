import { createVnPayPaymentUrl, type VnPayParams, verifyVnPayHash, vnPayConfig } from '@/lib/payments/vnpay'
import { tryScheduleVnPayReconciliation } from '@/lib/services/vnpay-reconciliation-scheduler'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendPaymentSuccessEmail } from '@/lib/mailer'

type CheckoutOrder = {
  id: string
  orderNumber: string
}
type Attempt = {
  id: string
  order_id: string
  transaction_reference: string
  order_number: string
  amount_vnd: number | string
  status: 'PENDING' | 'PAID' | 'FAILED'
}
type DepositAttempt = {
  id: string
  deposit_order_id: string
  transaction_reference: string
  order_number: string
  amount_vnd: number | string
  status: 'PENDING' | 'PAID' | 'FAILED'
}
type DepositCallbackCommandResult = {
  attempt_status: 'PENDING' | 'PAID' | 'FAILED'
  order_status: string
  refund_status: string
  outcome: 'PAYMENT_CONFIRMED' | 'PAYMENT_FAILED' | 'ALREADY_PAID' | 'ORDER_ALREADY_ADVANCED' | 'REFUND_REQUIRED' | 'ATTEMPT_TERMINAL_FAILED'
  replayed: boolean
}
export type VnPayCallbackResult = {
  valid: boolean
  success: boolean
  orderId?: string
  orderNumber?: string
  responseCode?: string
  orderKind?: 'accessory' | 'deposit'
  message: string
}
const columns = 'id,order_id,transaction_reference,order_number,amount_vnd,status'
const depositColumns = 'id,deposit_order_id,transaction_reference,order_number,amount_vnd,status'

async function pendingAttempt(orderId: string) {
  const result = await getSupabaseAdmin().from('vnpay_checkout_attempts')
    .select(columns).eq('order_id', orderId).eq('status', 'PENDING').maybeSingle<Attempt>()
  if (result.error) throw result.error
  return result.data
}

export async function createOrReuseVnPayPayment(
  order: CheckoutOrder,
  clientIp: string,
  options: { forceNewAttempt?: boolean } = {},
) {
  const orderResult = await getSupabaseAdmin().from('orders')
    .select('order_number,total_amount')
    .eq('id', order.id)
    .maybeSingle<{ order_number: string; total_amount: number | string }>()
  if (orderResult.error) throw orderResult.error
  if (!orderResult.data) throw new Error('Không tìm thấy đơn hàng để thanh toán.')
  const amountVnd = Number(orderResult.data.total_amount)
  if (!Number.isFinite(amountVnd) || amountVnd <= 0) {
    throw new Error('Tổng tiền thanh toán không hợp lệ.')
  }

  let attempt = await pendingAttempt(order.id)
  if (attempt && options.forceNewAttempt) {
    const expired = await getSupabaseAdmin().from('vnpay_checkout_attempts')
      .update({
        status: 'FAILED',
        response_code: 'EXPIRED_OR_RETRIED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', attempt.id)
      .eq('status', 'PENDING')
    if (expired.error) throw expired.error
    attempt = null
  }
  if (attempt && Number(attempt.amount_vnd) !== amountVnd) {
    const synchronized = await getSupabaseAdmin().from('vnpay_checkout_attempts')
      .update({ amount_vnd: amountVnd, updated_at: new Date().toISOString() })
      .eq('id', attempt.id)
      .eq('status', 'PENDING')
      .select(columns)
      .single<Attempt>()
    if (synchronized.error) throw synchronized.error
    attempt = synchronized.data
  }
  if (!attempt) {
    const result = await getSupabaseAdmin().from('vnpay_checkout_attempts').insert({
      order_id: order.id,
      transaction_reference: `FL${Date.now()}${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
      order_number: orderResult.data.order_number,
      amount_vnd: amountVnd,
    }).select(columns).single<Attempt>()
    if (result.error) {
      if (result.error.code === '23505') attempt = await pendingAttempt(order.id)
      if (!attempt) throw result.error
    } else attempt = result.data
  }
  await tryScheduleVnPayReconciliation({ attemptId: attempt.id, orderKind: 'accessory' })
  return createVnPayPaymentUrl({
    transactionReference: attempt.transaction_reference,
    orderNumber: attempt.order_number,
    amountVnd: Number(attempt.amount_vnd),
    clientIp,
  })
}

export async function createOrReuseVnPayDepositPayment(
  order: CheckoutOrder,
  clientIp: string,
) {
  const supabase = getSupabaseAdmin()
  const orderResult = await supabase.from('deposit_orders')
    .select('order_number,deposit_amount')
    .eq('id', order.id)
    .maybeSingle<{ order_number: string; deposit_amount: number | string }>()
  if (orderResult.error) throw orderResult.error
  if (!orderResult.data) throw new Error('Không tìm thấy đơn đặt cọc để thanh toán.')

  const amountVnd = Number(orderResult.data.deposit_amount)
  if (!Number.isFinite(amountVnd) || amountVnd <= 0) {
    throw new Error('Số tiền đặt cọc không hợp lệ.')
  }

  const pending = await supabase.from('vnpay_deposit_attempts')
    .select(depositColumns)
    .eq('deposit_order_id', order.id)
    .eq('status', 'PENDING')
    .maybeSingle<DepositAttempt>()
  if (pending.error) throw pending.error
  let attempt = pending.data

  // To prevent VNPAY Error 01 (Transaction already in progress) when user clicks "Thanh toán lại",
  // we must cancel the old attempt and generate a new one with a fresh transaction reference.
  if (attempt) {
    const expired = await supabase.from('vnpay_deposit_attempts')
      .update({
        status: 'FAILED',
        response_code: 'EXPIRED_OR_RETRIED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', attempt.id)
      .eq('status', 'PENDING')
    if (expired.error) throw expired.error
    attempt = null
  }

  if (!attempt) {
    const inserted = await supabase.from('vnpay_deposit_attempts').insert({
      deposit_order_id: order.id,
      transaction_reference: `FLD${Date.now()}${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`,
      order_number: orderResult.data.order_number,
      amount_vnd: amountVnd,
    }).select(depositColumns).single<DepositAttempt>()
    if (inserted.error) {
      if (inserted.error.code === '23505') {
        const retry = await supabase.from('vnpay_deposit_attempts')
          .select(depositColumns)
          .eq('deposit_order_id', order.id)
          .eq('status', 'PENDING')
          .maybeSingle<DepositAttempt>()
        if (retry.error) throw retry.error
        attempt = retry.data
      }
      if (!attempt) throw inserted.error
    } else {
      attempt = inserted.data
    }
  }

  await tryScheduleVnPayReconciliation({ attemptId: attempt.id, orderKind: 'deposit' })
  return createVnPayPaymentUrl({
    transactionReference: attempt.transaction_reference,
    orderNumber: attempt.order_number,
    amountVnd: Number(attempt.amount_vnd),
    clientIp,
  })
}

async function processDepositCallback(
  attempt: DepositAttempt,
  params: VnPayParams,
  options: { updatePayment?: boolean },
): Promise<VnPayCallbackResult> {
  const order = {
    orderId: attempt.deposit_order_id,
    orderNumber: attempt.order_number,
    orderKind: 'deposit' as const,
  }
  if (Number(params.vnp_Amount) !== Math.round(Number(attempt.amount_vnd) * 100)) {
    return { valid: false, success: false, ...order, message: 'Số tiền VNPAY không khớp.' }
  }

  const responseCode = params.vnp_ResponseCode || ''
  const success = responseCode === '00' && params.vnp_TransactionStatus === '00'
  const base = { valid: true, success, ...order, responseCode }
  if (attempt.status === 'FAILED') {
    return { ...base, success: false, message: 'Giao dịch này đã hết hạn hoặc đã được thay thế.' }
  }
  if (options.updatePayment === false) {
    return { ...base, message: success ? 'Thanh toán đặt cọc thành công.' : 'Thanh toán chưa thành công hoặc đã bị hủy.' }
  }

  const supabase = getSupabaseAdmin()
  const now = new Date().toISOString()
  const { data: command, error } = await supabase.rpc('process_vnpay_deposit_callback', {
    p_attempt_id: attempt.id,
    p_success: success,
    p_response_code: responseCode || params.vnp_TransactionStatus || '',
    p_transaction_no: params.vnp_TransactionNo || '',
    p_bank_code: params.vnp_BankCode || '',
    p_response_payload: params,
    p_paid_at: success ? now : null,
  }).single<DepositCallbackCommandResult>()
  if (error || !command) throw error || new Error('Không thể ghi nhận kết quả thanh toán đặt cọc.')

  if (command.outcome === 'ATTEMPT_TERMINAL_FAILED') {
    return { ...base, success: false, message: 'Giao dịch này đã hết hạn hoặc đã được thay thế.' }
  }
  if (command.outcome === 'PAYMENT_FAILED') {
    return { ...base, success: false, message: 'Thanh toán chưa thành công hoặc đã bị hủy.' }
  }
  if (command.outcome === 'REFUND_REQUIRED') {
    return {
      ...base,
      success: false,
      message: 'Giao dịch được ghi nhận sau khi đơn bị hủy. Khoản tiền cọc đang chờ quản trị viên xác nhận hoàn tiền.',
    }
  }
  if (command.outcome === 'ALREADY_PAID' || command.outcome === 'ORDER_ALREADY_ADVANCED') {
    return { ...base, success: true, message: 'Giao dịch đặt cọc đã được xác nhận.' }
  }
  // Send success email
  try {
    const orderRecord = await supabase.from('deposit_orders').select('email').eq('id', attempt.deposit_order_id).maybeSingle();
    if (orderRecord.data?.email) {
      await sendPaymentSuccessEmail(orderRecord.data.email, attempt.order_number, Number(attempt.amount_vnd));
    }
  } catch (err) {
    console.error('Failed to send deposit success email:', err);
  }

  return { ...base, success: true, message: 'Thanh toán đặt cọc thành công.' }
}

export async function processVnPayCallback(
  params: VnPayParams,
  options: { updatePayment?: boolean } = {},
): Promise<VnPayCallbackResult> {
  if (!verifyVnPayHash(params)) return { valid: false, success: false, message: 'Chữ ký VNPAY không hợp lệ.' }
  if (params.vnp_TmnCode && params.vnp_TmnCode !== vnPayConfig().tmnCode)
    return { valid: false, success: false, message: 'Mã website VNPAY không hợp lệ.' }
  const reference = params.vnp_TxnRef
  if (!reference) return { valid: false, success: false, message: 'Thiếu mã giao dịch VNPAY.' }
  const lookup = await getSupabaseAdmin().from('vnpay_checkout_attempts')
    .select(columns).eq('transaction_reference', reference).maybeSingle<Attempt>()
  if (lookup.error) throw lookup.error
  const attempt = lookup.data
  if (!attempt) {
    const depositLookup = await getSupabaseAdmin().from('vnpay_deposit_attempts')
      .select(depositColumns).eq('transaction_reference', reference).maybeSingle<DepositAttempt>()
    if (depositLookup.error) throw depositLookup.error
    if (depositLookup.data) return processDepositCallback(depositLookup.data, params, options)
    return { valid: false, success: false, message: 'Không tìm thấy giao dịch.' }
  }
  if (Number(params.vnp_Amount) !== Math.round(Number(attempt.amount_vnd) * 100))
    return { valid: false, success: false, orderId: attempt.order_id, orderNumber: attempt.order_number, message: 'Số tiền VNPAY không khớp.' }
  const responseCode = params.vnp_ResponseCode || ''
  const success = responseCode === '00' && params.vnp_TransactionStatus === '00'
  const base = { valid: true, success, orderId: attempt.order_id, orderNumber: attempt.order_number, responseCode, orderKind: 'accessory' as const }
  if (attempt.status === 'FAILED') {
    return { ...base, success: false, message: 'Giao dịch này đã hết hạn hoặc đã được thay thế.' }
  }
  if (options.updatePayment === false) {
    return { ...base, message: success ? 'Thanh toán đơn hàng thành công.' : 'Thanh toán chưa thành công hoặc đã bị hủy.' }
  }
  if (attempt.status === 'PAID') {
    await getSupabaseAdmin().from('orders').update({ status: 'PAID' })
      .eq('id', attempt.order_id).eq('status', 'PENDING')
    return { ...base, success: true, message: 'Giao dịch đã được xác nhận.' }
  }
  const now = new Date().toISOString()
  if (!success) {
    const update = await getSupabaseAdmin().from('vnpay_checkout_attempts').update({
      status: 'FAILED', response_code: responseCode || params.vnp_TransactionStatus,
      vnpay_transaction_no: params.vnp_TransactionNo || null,
      bank_code: params.vnp_BankCode || null, updated_at: now,
    }).eq('id', attempt.id).eq('status', 'PENDING')
    if (update.error) throw update.error
    return { ...base, message: 'Thanh toán chưa thành công hoặc đã bị hủy.' }
  }
  const orderUpdate = await getSupabaseAdmin().from('orders').update({ status: 'PAID' })
    .eq('id', attempt.order_id).eq('status', 'PENDING')
  if (orderUpdate.error) {
    if (orderUpdate.error.code === '23514' && orderUpdate.error.message.includes('INVALID_ORDER_TRANSITION_PENDING_TO_PAID')) {
      throw new Error('Database chưa cho phép chuyển đơn từ chờ thanh toán sang đã thanh toán. Hãy áp dụng migration 041.')
    }
    throw orderUpdate.error
  }
  const paymentUpdate = await getSupabaseAdmin().from('vnpay_checkout_attempts').update({
    status: 'PAID', response_code: responseCode,
    vnpay_transaction_no: params.vnp_TransactionNo || null,
    bank_code: params.vnp_BankCode || null, paid_at: now, updated_at: now,
  }).eq('id', attempt.id).eq('status', 'PENDING')
  if (paymentUpdate.error) throw paymentUpdate.error
  return { ...base, message: 'Thanh toán đơn hàng thành công.' }
}
