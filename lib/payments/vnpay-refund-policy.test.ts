import { describe, expect, it } from 'vitest'

import {
  isSyntheticDebugVnPayPayment,
  unsignedVnPayResponseMessage,
} from './vnpay-refund-policy'

describe('VNPay refund policy', () => {
  it('recognizes only payment evidence created by the deposit debug command', () => {
    const evidence = {
      bank_code: 'FASTLANE_DEBUG',
      vnpay_transaction_no: 'DEBUG123',
      response_payload: { source: 'ADMIN_DEBUG_ACTION' },
    }
    expect(isSyntheticDebugVnPayPayment(evidence)).toBe(true)
    expect(isSyntheticDebugVnPayPayment({ ...evidence, bank_code: 'NCB' })).toBe(false)
    expect(isSyntheticDebugVnPayPayment({ ...evidence, vnpay_transaction_no: '123456' })).toBe(false)
    expect(isSyntheticDebugVnPayPayment({ ...evidence, response_payload: {} })).toBe(false)
  })

  it('reports an unsigned VNPay error using its real response code and message', () => {
    expect(unsignedVnPayResponseMessage({
      vnp_ResponseCode: '99',
      vnp_Message: 'VNPAY internal error',
    })).toBe('VNPay không thể xử lý yêu cầu hoàn tiền (mã 99: VNPAY internal error).')
  })
})
