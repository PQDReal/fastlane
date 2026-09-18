import { randomUUID } from 'node:crypto'

export const VNPAY_TRANSACTION_NO_MAX_LENGTH = 32

export function createDebugVnpayTransactionNo(
  timestamp = Date.now(),
  entropy = randomUUID(),
) {
  const compactEntropy = entropy.replaceAll('-', '')
  return `DEBUG${timestamp}${compactEntropy}`.slice(0, VNPAY_TRANSACTION_NO_MAX_LENGTH)
}
