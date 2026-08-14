import { describe, expect, it } from 'vitest'

import {
  accessoryOrderStatusPresentation,
  cancelledOrderStatusPresentation,
  depositPaymentStatusPresentation,
  refundStatusPresentation,
  vehicleOrderStatusPresentation,
  type AdminOrderRefundStatus,
} from './admin-status-presentation'

describe('admin order status presentation', () => {
  it.each<AdminOrderRefundStatus>(['NONE', 'PENDING', 'COMPLETED'])(
    'uses the same cancelled presentation for accessory and vehicle orders with refund %s',
    (refundStatus) => {
      const canonical = cancelledOrderStatusPresentation(refundStatus)
      expect(accessoryOrderStatusPresentation('CANCELLED', refundStatus)).toEqual(canonical)
      expect(vehicleOrderStatusPresentation({
        status: 'CANCELLED',
        refundStatus,
        payment: 'Paid',
      })).toEqual(canonical)
    },
  )

  it('keeps completed refunds red because the order remains cancelled', () => {
    expect(cancelledOrderStatusPresentation('NONE').className).toContain('bg-red-100')
    expect(cancelledOrderStatusPresentation('PENDING').className).toContain('bg-orange-100')
    expect(cancelledOrderStatusPresentation('COMPLETED').tone).toBe('cancelled')
    expect(cancelledOrderStatusPresentation('COMPLETED').className).toContain('bg-red-100')
  })

  it('uses the success tone for completed orders and completed refunds', () => {
    expect(accessoryOrderStatusPresentation('DELIVERED', 'NONE').tone).toBe('success')
    expect(vehicleOrderStatusPresentation({
      status: 'COMPLETED',
      refundStatus: 'NONE',
      payment: 'Paid',
    }).tone).toBe('success')
    expect(refundStatusPresentation('COMPLETED').tone).toBe('success')
  })

  it.each([
    ['PENDING', 'Đang xác minh thanh toán', 'pending'],
    ['FAILED', 'Thanh toán thất bại', 'cancelled'],
  ] as const)('presents a %s deposit attempt consistently', (paymentAttemptStatus, label, tone) => {
    expect(depositPaymentStatusPresentation({
      status: 'PENDING_DEPOSIT',
      refundStatus: 'NONE',
      payment: 'Unpaid',
      paymentAttemptStatus,
    })).toMatchObject({ label, tone })
  })
})
