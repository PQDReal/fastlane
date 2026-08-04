import 'server-only'

import { createVnPayPipeHash, verifyVnPayPipeHash, vnPayConfig, vnPayDate, type VnPayParams } from '@/lib/payments/vnpay'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type RefundAttempt = {
  id: string
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  request_id: string
}

const REFUND_QUERY_INTERVAL_MS = 310_000
const nextQueryAt = (from = new Date()) => new Date(from.getTime() + REFUND_QUERY_INTERVAL_MS).toISOString()

export class VnPayRefundError extends Error {
  constructor(message: string, public readonly code = 'VNPAY_REFUND_FAILED') {
    super(message)
    this.name = 'VnPayRefundError'
  }
}

const normalizeIp = (ip: string) => !ip || ip === '::1' ? '127.0.0.1' : ip.replace(/^::ffff:/, '')

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

export async function refundCancelledOrder(input: { orderId: string; requestedBy: string; clientIp: string }) {
  const supabase = getSupabaseAdmin()
  const orderResult = await supabase.from('orders')
    .select('id,order_number,status,refund_status,total_amount')
    .eq('id', input.orderId).maybeSingle()
  if (orderResult.error) throw orderResult.error
  const order = orderResult.data
  if (!order) throw new VnPayRefundError('Không tìm thấy đơn hàng.', 'ORDER_NOT_FOUND')
  if (order.status !== 'CANCELLED' || order.refund_status !== 'PENDING') {
    throw new VnPayRefundError('Đơn hàng không ở trạng thái chờ hoàn tiền.', 'REFUND_NOT_PENDING')
  }

  const existing = await supabase.from('vnpay_refund_attempts')
    .select('id,status,request_id').eq('order_id', input.orderId)
    .in('status', ['PENDING', 'PROCESSING', 'COMPLETED']).maybeSingle<RefundAttempt>()
  if (existing.error) throw existing.error
  if (existing.data) {
    if (existing.data.status === 'COMPLETED') {
      await supabase.from('orders').update({ refund_status: 'COMPLETED', updated_at: new Date().toISOString() }).eq('id', input.orderId)
    }
    return { refundStatus: existing.data.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING', attemptStatus: existing.data.status, requestId: existing.data.request_id, nextCheckAt: existing.data.status === 'COMPLETED' ? null : nextQueryAt() }
  }

  const paymentResult = await supabase.from('vnpay_checkout_attempts')
    .select('id,transaction_reference,amount_vnd,vnpay_transaction_no,created_at,paid_at')
    .eq('order_id', input.orderId).eq('status', 'PAID')
    .order('paid_at', { ascending: false }).limit(1).maybeSingle()
  if (paymentResult.error) throw paymentResult.error
  const payment = paymentResult.data
  if (!payment?.vnpay_transaction_no) {
    throw new VnPayRefundError('Không tìm thấy mã giao dịch VNPay đã thanh toán.', 'PAID_TRANSACTION_NOT_FOUND')
  }

  const amountVnd = Number(payment.amount_vnd)
  const requestId = crypto.randomUUID().replaceAll('-', '').slice(0, 32)
  const inserted = await supabase.from('vnpay_refund_attempts').insert({
    order_id: input.orderId,
    payment_attempt_id: payment.id,
    request_id: requestId,
    transaction_type: '02',
    amount_vnd: amountVnd,
    requested_by: input.requestedBy.slice(0, 245),
  }).select('id,status,request_id').single<RefundAttempt>()
  if (inserted.error) {
    if (inserted.error.code === '23505') throw new VnPayRefundError('Đơn hàng đã có yêu cầu hoàn tiền đang xử lý.', 'REFUND_ALREADY_REQUESTED')
    throw inserted.error
  }

  const config = vnPayConfig()
  const now = new Date()
  const params: VnPayParams = {
    vnp_RequestId: requestId,
    vnp_Version: '2.1.0',
    vnp_Command: 'refund',
    vnp_TmnCode: config.tmnCode,
    vnp_TransactionType: '02',
    vnp_TxnRef: payment.transaction_reference,
    vnp_Amount: String(Math.round(amountVnd * 100)),
    vnp_TransactionNo: payment.vnpay_transaction_no,
    vnp_TransactionDate: vnPayDate(new Date(payment.created_at)),
    vnp_CreateBy: input.requestedBy.slice(0, 245),
    vnp_CreateDate: vnPayDate(now),
    vnp_IpAddr: normalizeIp(input.clientIp),
    vnp_OrderInfo: `Hoan tien don hang ${order.order_number}`,
  }
  params.vnp_SecureHash = createVnPayPipeHash([
    params.vnp_RequestId, params.vnp_Version, params.vnp_Command, params.vnp_TmnCode,
    params.vnp_TransactionType, params.vnp_TxnRef, params.vnp_Amount, params.vnp_TransactionNo,
    params.vnp_TransactionDate, params.vnp_CreateBy, params.vnp_CreateDate, params.vnp_IpAddr, params.vnp_OrderInfo,
  ], config.hashSecret)

  let response: VnPayParams
  try {
    const result = await fetch(config.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params), cache: 'no-store' })
    response = await result.json() as VnPayParams
    if (!result.ok) throw new Error(`HTTP ${result.status}`)
  } catch (error) {
    await supabase.from('vnpay_refund_attempts').update({ status: 'FAILED', response_code: 'NETWORK_ERROR', response_payload: { message: error instanceof Error ? error.message : 'Network error' }, updated_at: new Date().toISOString() }).eq('id', inserted.data.id)
    throw new VnPayRefundError('Không thể kết nối API hoàn tiền VNPay.')
  }

  const validHash = verifyApiResponse(response, config.hashSecret)
  const responseCode = response.vnp_ResponseCode || 'UNKNOWN'
  const transactionStatus = response.vnp_TransactionStatus || ''
  const completed = validHash && responseCode === '00' && transactionStatus === '00'
  const processing = validHash && (responseCode === '94' || (responseCode === '00' && ['05', '06'].includes(transactionStatus)))
  const attemptStatus = completed ? 'COMPLETED' : processing ? 'PROCESSING' : 'FAILED'
  const updatedAt = new Date().toISOString()
  const attemptUpdate = await supabase.from('vnpay_refund_attempts').update({
    status: attemptStatus,
    response_code: validHash ? responseCode : 'INVALID_SIGNATURE',
    transaction_status: transactionStatus || null,
    vnpay_refund_transaction_no: response.vnp_TransactionNo || null,
    response_payload: response,
    completed_at: completed ? updatedAt : null,
    updated_at: updatedAt,
  }).eq('id', inserted.data.id)
  if (attemptUpdate.error) throw attemptUpdate.error

  if (completed) {
    const orderUpdate = await supabase.from('orders').update({ refund_status: 'COMPLETED', updated_at: updatedAt }).eq('id', input.orderId).eq('refund_status', 'PENDING')
    if (orderUpdate.error) throw orderUpdate.error
  }
  if (!validHash) throw new VnPayRefundError('Chữ ký phản hồi hoàn tiền VNPay không hợp lệ.', 'INVALID_VNPAY_SIGNATURE')
  if (attemptStatus === 'FAILED') throw new VnPayRefundError(`VNPay từ chối hoàn tiền (mã ${responseCode}).`)
  return { refundStatus: completed ? 'COMPLETED' : 'PENDING', attemptStatus, requestId, nextCheckAt: completed ? null : nextQueryAt(now) }
}

export async function reconcileVnPayRefund(input: { orderId: string; clientIp: string }) {
  const supabase = getSupabaseAdmin()
  const attemptResult = await supabase.from('vnpay_refund_attempts')
    .select('id,request_id,status,updated_at,vnpay_refund_transaction_no,payment:vnpay_checkout_attempts(transaction_reference,vnpay_transaction_no,created_at)')
    .eq('order_id', input.orderId).in('status', ['PENDING', 'PROCESSING']).maybeSingle()
  if (attemptResult.error) throw attemptResult.error
  if (!attemptResult.data) throw new VnPayRefundError('Không có yêu cầu hoàn tiền đang xử lý.', 'REFUND_NOT_PROCESSING')
  const lastCheckedAt = new Date(attemptResult.data.updated_at)
  const eligibleAt = new Date(lastCheckedAt.getTime() + REFUND_QUERY_INTERVAL_MS)
  if (Number.isFinite(lastCheckedAt.getTime()) && eligibleAt.getTime() > Date.now()) {
    return { refundStatus: 'PENDING', attemptStatus: attemptResult.data.status, requestId: attemptResult.data.request_id, nextCheckAt: eligibleAt.toISOString() }
  }

  const claimedAt = new Date()
  const claim = await supabase.from('vnpay_refund_attempts')
    .update({ updated_at: claimedAt.toISOString() })
    .eq('id', attemptResult.data.id)
    .eq('updated_at', attemptResult.data.updated_at)
    .select('id')
    .maybeSingle()
  if (claim.error) throw claim.error
  if (!claim.data) {
    return { refundStatus: 'PENDING', attemptStatus: attemptResult.data.status, requestId: attemptResult.data.request_id, nextCheckAt: nextQueryAt(claimedAt) }
  }

  const paymentRelation = attemptResult.data.payment as unknown
  const payment = (Array.isArray(paymentRelation) ? paymentRelation[0] : paymentRelation) as { transaction_reference: string; vnpay_transaction_no: string | null; created_at: string } | null
  if (!payment) throw new VnPayRefundError('Không tìm thấy giao dịch thanh toán gốc.', 'PAID_TRANSACTION_NOT_FOUND')

  const config = vnPayConfig()
  const now = new Date()
  const params: VnPayParams = {
    vnp_RequestId: crypto.randomUUID().replaceAll('-', '').slice(0, 32),
    vnp_Version: '2.1.0', vnp_Command: 'querydr', vnp_TmnCode: config.tmnCode,
    vnp_TxnRef: payment.transaction_reference,
    vnp_OrderInfo: `Kiem tra hoan tien ${input.orderId}`,
    vnp_TransactionNo: attemptResult.data.vnpay_refund_transaction_no || payment.vnpay_transaction_no || '',
    vnp_TransactionDate: vnPayDate(new Date(payment.created_at)),
    vnp_CreateDate: vnPayDate(now), vnp_IpAddr: normalizeIp(input.clientIp),
  }
  params.vnp_SecureHash = createVnPayPipeHash([
    params.vnp_RequestId, params.vnp_Version, params.vnp_Command, params.vnp_TmnCode,
    params.vnp_TxnRef, params.vnp_TransactionDate, params.vnp_CreateDate, params.vnp_IpAddr, params.vnp_OrderInfo,
  ], config.hashSecret)

  let response: VnPayParams
  try {
    const result = await fetch(config.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params), cache: 'no-store' })
    response = await result.json() as VnPayParams
    if (!result.ok) throw new Error(`HTTP ${result.status}`)
  } catch {
    throw new VnPayRefundError('Không thể kết nối API đối soát VNPay.')
  }
  // Sandbox returns a minimal, unsigned response for queries repeated inside
  // its deduplication window. It carries no authoritative transaction state,
  // so preserve PROCESSING and let the admin retry later.
  if (response.vnp_ResponseCode === '94' && !response.vnp_SecureHash) {
    return {
      refundStatus: 'PENDING',
      attemptStatus: 'PROCESSING' as const,
      requestId: attemptResult.data.request_id,
      nextCheckAt: nextQueryAt(claimedAt),
    }
  }
  const validHash = verifyApiResponse(response, config.hashSecret)
  if (!validHash) {
    await supabase.from('vnpay_refund_attempts').update({ response_code: 'INVALID_SIGNATURE', response_payload: response, updated_at: new Date().toISOString() }).eq('id', attemptResult.data.id)
    throw new VnPayRefundError('Chữ ký đối soát VNPay không hợp lệ.', 'INVALID_VNPAY_SIGNATURE')
  }

  const transactionStatus = response.vnp_TransactionStatus || ''
  const isRefund = ['02', '03'].includes(response.vnp_TransactionType || '')
  const completed = response.vnp_ResponseCode === '00' && isRefund && transactionStatus === '00'
  const failed = response.vnp_ResponseCode !== '00' || transactionStatus === '09'
  const attemptStatus = completed ? 'COMPLETED' : failed ? 'FAILED' : 'PROCESSING'
  const updatedAt = new Date().toISOString()
  const update = await supabase.from('vnpay_refund_attempts').update({
    status: attemptStatus, response_code: response.vnp_ResponseCode || null,
    transaction_status: transactionStatus || null, response_payload: response,
    completed_at: completed ? updatedAt : null, updated_at: updatedAt,
  }).eq('id', attemptResult.data.id)
  if (update.error) throw update.error
  if (completed) {
    const orderUpdate = await supabase.from('orders').update({ refund_status: 'COMPLETED', updated_at: updatedAt }).eq('id', input.orderId).eq('refund_status', 'PENDING')
    if (orderUpdate.error) throw orderUpdate.error
  }
  return { refundStatus: completed ? 'COMPLETED' : 'PENDING', attemptStatus, requestId: attemptResult.data.request_id, nextCheckAt: completed || failed ? null : nextQueryAt(claimedAt) }
}
