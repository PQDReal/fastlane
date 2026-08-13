export type VnPayPaymentEvidence = {
  bank_code?: unknown
  vnpay_transaction_no?: unknown
  response_payload?: unknown
}

export function isSyntheticDebugVnPayPayment(payment: VnPayPaymentEvidence) {
  const payload = payment.response_payload
  return payment.bank_code === 'FASTLANE_DEBUG'
    && typeof payment.vnpay_transaction_no === 'string'
    && payment.vnpay_transaction_no.startsWith('DEBUG')
    && typeof payload === 'object'
    && payload !== null
    && 'source' in payload
    && payload.source === 'ADMIN_DEBUG_ACTION'
}

export function unsignedVnPayResponseMessage(response: Record<string, unknown>) {
  const responseCode = typeof response.vnp_ResponseCode === 'string'
    ? response.vnp_ResponseCode
    : 'UNKNOWN'
  const detail = typeof response.vnp_Message === 'string' && response.vnp_Message.trim()
    ? `: ${response.vnp_Message.trim()}`
    : ''
  return `VNPay không thể xử lý yêu cầu hoàn tiền (mã ${responseCode}${detail}).`
}
