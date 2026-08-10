import { describe, expect, it } from 'vitest'
import {
  createDebugVnpayTransactionNo,
  VNPAY_TRANSACTION_NO_MAX_LENGTH,
} from './debug-transaction'

describe('debug VNPAY transaction number', () => {
  it('stays unique-looking while respecting the database column limit', () => {
    const transactionNo = createDebugVnpayTransactionNo(
      1786346400005,
      '12345678-1234-1234-1234-123456789012',
    )

    expect(transactionNo).toBe('DEBUG178634640000512345678123412')
    expect(transactionNo).toHaveLength(VNPAY_TRANSACTION_NO_MAX_LENGTH)
  })
})
