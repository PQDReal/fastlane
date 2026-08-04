import { createVnPayPaymentUrl, type VnPayParams, verifyVnPayHash, vnPayConfig } from '@/lib/payments/vnpay'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

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
export type VnPayCallbackResult = {
  valid: boolean
  success: boolean
  orderId?: string
  orderNumber?: string
  responseCode?: string
  message: string
}
const columns = 'id,order_id,transaction_reference,order_number,amount_vnd,status'

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
  return createVnPayPaymentUrl({
    transactionReference: attempt.transaction_reference,
    orderNumber: attempt.order_number,
    amountVnd: Number(attempt.amount_vnd),
    clientIp,
  })
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
  if (!attempt) return { valid: false, success: false, message: 'Không tìm thấy giao dịch.' }
  if (Number(params.vnp_Amount) !== Math.round(Number(attempt.amount_vnd) * 100))
    return { valid: false, success: false, orderId: attempt.order_id, orderNumber: attempt.order_number, message: 'Số tiền VNPAY không khớp.' }
  const responseCode = params.vnp_ResponseCode || ''
  const success = responseCode === '00' && params.vnp_TransactionStatus === '00'
  const base = { valid: true, success, orderId: attempt.order_id, orderNumber: attempt.order_number, responseCode }
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
