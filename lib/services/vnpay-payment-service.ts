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
type DepositAttempt = {
  id: string
  deposit_order_id: string
  transaction_reference: string
  order_number: string
  amount_vnd: number | string
  status: 'PENDING' | 'PAID' | 'FAILED'
}
type VehicleBalanceAttempt = DepositAttempt
export type VnPayCallbackResult = {
  valid: boolean
  success: boolean
  orderId?: string
  orderNumber?: string
  responseCode?: string
  orderKind?: 'accessory' | 'deposit' | 'vehicle_balance'
  message: string
}
const columns = 'id,order_id,transaction_reference,order_number,amount_vnd,status'
const depositColumns = 'id,deposit_order_id,transaction_reference,order_number,amount_vnd,status'
const balanceColumns = depositColumns

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

export async function createOrReuseVnPayDepositPayment(
  order: CheckoutOrder,
  clientIp: string,
  options: { forceNewAttempt?: boolean } = {},
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

  if (attempt && options.forceNewAttempt) {
    const expired = await supabase.from('vnpay_deposit_attempts').update({
      status: 'FAILED', response_code: 'EXPIRED_OR_RETRIED', updated_at: new Date().toISOString(),
    }).eq('id', attempt.id).eq('status', 'PENDING')
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

  return createVnPayPaymentUrl({
    transactionReference: attempt.transaction_reference,
    orderNumber: attempt.order_number,
    amountVnd: Number(attempt.amount_vnd),
    clientIp,
  })
}

export async function createOrReuseVnPayVehicleBalancePayment(
  order: CheckoutOrder,
  clientIp: string,
  options: { forceNewAttempt?: boolean } = {},
) {
  const supabase = getSupabaseAdmin()
  const orderResult = await supabase.from('deposit_orders')
    .select('order_number,total_estimated_price,deposit_amount,status')
    .eq('id', order.id)
    .maybeSingle<{ order_number: string; total_estimated_price: number | string; deposit_amount: number | string; status: string }>()
  if (orderResult.error) throw orderResult.error
  if (!orderResult.data) throw new Error('Không tìm thấy đơn mua xe để thanh toán.')
  if (!['CONTRACT_SIGNED', 'PENDING_PAYMENT'].includes(orderResult.data.status)) {
    throw new Error('Đơn mua xe không ở trạng thái chờ thanh toán phần còn lại.')
  }
  const amountVnd = Number(orderResult.data.total_estimated_price) - Number(orderResult.data.deposit_amount)
  if (!Number.isFinite(amountVnd) || amountVnd <= 0) throw new Error('Số tiền còn lại không hợp lệ.')

  const pending = await supabase.from('vnpay_vehicle_balance_attempts')
    .select(balanceColumns).eq('deposit_order_id', order.id).eq('status', 'PENDING')
    .maybeSingle<VehicleBalanceAttempt>()
  if (pending.error) throw pending.error
  let attempt = pending.data
  if (attempt && options.forceNewAttempt) {
    const expired = await supabase.from('vnpay_vehicle_balance_attempts').update({
      status: 'FAILED', response_code: 'EXPIRED_OR_RETRIED', updated_at: new Date().toISOString(),
    }).eq('id', attempt.id).eq('status', 'PENDING')
    if (expired.error) throw expired.error
    attempt = null
  }
  if (!attempt) {
    const inserted = await supabase.from('vnpay_vehicle_balance_attempts').insert({
      deposit_order_id: order.id,
      transaction_reference: `FLB${Date.now()}${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`,
      order_number: orderResult.data.order_number,
      amount_vnd: amountVnd,
    }).select(balanceColumns).single<VehicleBalanceAttempt>()
    if (inserted.error) throw inserted.error
    attempt = inserted.data
  }
  if (orderResult.data.status === 'CONTRACT_SIGNED') {
    const update = await supabase.from('deposit_orders').update({ status: 'PENDING_PAYMENT', updated_at: new Date().toISOString() })
      .eq('id', order.id).eq('status', 'CONTRACT_SIGNED')
    if (update.error) throw update.error
  }
  return createVnPayPaymentUrl({
    transactionReference: attempt.transaction_reference,
    orderNumber: attempt.order_number,
    amountVnd: Number(attempt.amount_vnd),
    clientIp,
    orderInfo: `Thanh toan phan con lai ${attempt.order_number}`,
  })
}

async function processVehicleBalanceCallback(
  attempt: VehicleBalanceAttempt,
  params: VnPayParams,
  options: { updatePayment?: boolean },
): Promise<VnPayCallbackResult> {
  const baseOrder = { orderId: attempt.deposit_order_id, orderNumber: attempt.order_number, orderKind: 'vehicle_balance' as const }
  if (Number(params.vnp_Amount) !== Math.round(Number(attempt.amount_vnd) * 100)) {
    return { valid: false, success: false, ...baseOrder, message: 'Số tiền VNPAY không khớp.' }
  }
  const responseCode = params.vnp_ResponseCode || ''
  const success = responseCode === '00' && params.vnp_TransactionStatus === '00'
  const base = { valid: true, success, ...baseOrder, responseCode }
  if (attempt.status === 'FAILED') return { ...base, success: false, message: 'Giao dịch đã hết hạn hoặc được thay thế.' }
  if (options.updatePayment === false) return { ...base, message: success ? 'Thanh toán phần còn lại thành công.' : 'Thanh toán chưa thành công.' }

  const supabase = getSupabaseAdmin()
  if (attempt.status === 'PAID') {
    const orderUpdate = await supabase.from('deposit_orders').update({ status: 'PAID', updated_at: new Date().toISOString() })
      .eq('id', attempt.deposit_order_id).eq('status', 'PENDING_PAYMENT')
    if (orderUpdate.error) throw orderUpdate.error
    return { ...base, success: true, message: 'Giao dịch đã được xác nhận.' }
  }
  const now = new Date().toISOString()
  const responseDetails = {
    response_code: responseCode || params.vnp_TransactionStatus,
    vnpay_transaction_no: params.vnp_TransactionNo || null,
    bank_code: params.vnp_BankCode || null,
    response_payload: params,
    updated_at: now,
  }
  if (!success) {
    const failed = await supabase.from('vnpay_vehicle_balance_attempts').update({ status: 'FAILED', ...responseDetails })
      .eq('id', attempt.id).eq('status', 'PENDING')
    if (failed.error) throw failed.error
    return { ...base, message: 'Thanh toán chưa thành công hoặc đã bị hủy.' }
  }
  const orderUpdate = await supabase.from('deposit_orders').update({ status: 'PAID', updated_at: now })
    .eq('id', attempt.deposit_order_id).eq('status', 'PENDING_PAYMENT')
  if (orderUpdate.error) throw orderUpdate.error
  const paid = await supabase.from('vnpay_vehicle_balance_attempts').update({ status: 'PAID', ...responseDetails, paid_at: now })
    .eq('id', attempt.id).eq('status', 'PENDING')
  if (paid.error) throw paid.error
  return { ...base, message: 'Thanh toán phần còn lại thành công.' }
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
  if (attempt.status === 'PAID') {
    const orderUpdate = await supabase.from('deposit_orders')
      .update({ status: 'PENDING_CONFIRMATION' })
      .eq('id', attempt.deposit_order_id)
      .eq('status', 'PENDING_DEPOSIT')
    if (orderUpdate.error) throw orderUpdate.error
    return { ...base, success: true, message: 'Giao dịch đặt cọc đã được xác nhận.' }
  }

  const now = new Date().toISOString()
  const responseDetails = {
    response_code: responseCode || params.vnp_TransactionStatus,
    vnpay_transaction_no: params.vnp_TransactionNo || null,
    bank_code: params.vnp_BankCode || null,
    response_payload: params,
    updated_at: now,
  }
  if (!success) {
    const failed = await supabase.from('vnpay_deposit_attempts')
      .update({ status: 'FAILED', ...responseDetails })
      .eq('id', attempt.id)
      .eq('status', 'PENDING')
    if (failed.error) throw failed.error
    return { ...base, message: 'Thanh toán chưa thành công hoặc đã bị hủy.' }
  }

  const orderUpdate = await supabase.from('deposit_orders')
    .update({ status: 'PENDING_CONFIRMATION' })
    .eq('id', attempt.deposit_order_id)
    .eq('status', 'PENDING_DEPOSIT')
  if (orderUpdate.error) throw orderUpdate.error
  const paid = await supabase.from('vnpay_deposit_attempts')
    .update({ status: 'PAID', ...responseDetails, paid_at: now })
    .eq('id', attempt.id)
    .eq('status', 'PENDING')
  if (paid.error) throw paid.error
  return { ...base, message: 'Thanh toán đặt cọc thành công.' }
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
    const balanceLookup = await getSupabaseAdmin().from('vnpay_vehicle_balance_attempts')
      .select(balanceColumns).eq('transaction_reference', reference).maybeSingle<VehicleBalanceAttempt>()
    if (balanceLookup.error) throw balanceLookup.error
    if (!balanceLookup.data) return { valid: false, success: false, message: 'Không tìm thấy giao dịch.' }
    return processVehicleBalanceCallback(balanceLookup.data, params, options)
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
