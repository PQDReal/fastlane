import { describe, expect, it } from 'vitest'
import {
  DEPOSIT_ORDER_JOURNEY_STEPS,
  getDepositContractMode,
  calculateContractSignatureDeadline,
  isContractSignatureOverdue,
  canCustomerCancelDepositOrder,
  getDepositDocumentAccess,
  hasIssuedDepositDocumentProjection,
} from './contract-workflow'

describe('deposit contract workflow', () => {
  it('uses one customer-facing journey for cars and motorbikes', () => {
    expect(DEPOSIT_ORDER_JOURNEY_STEPS).toEqual([
      'Chờ xét duyệt',
      'Xác thực KYC',
      'Ký hợp đồng',
      'Chờ xe',
      'Nhận xe',
    ])
  })

  it('uses the car sales contract for cars', () => {
    expect(getDepositContractMode({ vehicle_type: 'car' })).toBe('CAR_SALES')
  })

  it('uses the same purchase terms for every motorbike battery option', () => {
    expect(
      getDepositContractMode({ vehicle_type: 'motorbike', car_variant: 'Không kèm Pin (Thuê pin)' })
    ).toBe('BIKE_PURCHASE_TERMS')
  })

  it('uses purchase terms for battery-included bikes', () => {
    expect(getDepositContractMode({ vehicle_type: 'motorbike', car_variant: 'Mua Pin' })).toBe(
      'BIKE_PURCHASE_TERMS'
    )
  })

  it('recognizes a legacy motorbike from the related variant product type', () => {
    expect(getDepositContractMode({
      vehicle_type: null,
      vehicle_variants: { product_type: 'BIKE' },
    })).toBe('BIKE_PURCHASE_TERMS')
  })

  it('keeps an explicit order vehicle type authoritative', () => {
    expect(getDepositContractMode({
      vehicle_type: 'car',
      vehicle_variants: { product_type: 'BIKE' },
    })).toBe('CAR_SALES')
  })

  describe('contract signature deadline calculations', () => {
    it('calculates 72h deadline correctly from issued_at timestamp', () => {
      const issuedAt = new Date('2026-08-01T10:00:00.000Z')
      const dueAt = calculateContractSignatureDeadline(issuedAt, 72)
      expect(dueAt.toISOString()).toBe('2026-08-04T10:00:00.000Z')
    })

    it('detects contract signature deadline overdue state correctly', () => {
      const dueAt = '2026-08-04T10:00:00.000Z'
      const beforeDeadline = new Date('2026-08-04T09:59:59.000Z')
      const afterDeadline = new Date('2026-08-04T10:00:01.000Z')

      expect(isContractSignatureOverdue(dueAt, beforeDeadline)).toBe(false)
      expect(isContractSignatureOverdue(dueAt, new Date('2026-08-04T10:00:00.000Z'))).toBe(true)
      expect(isContractSignatureOverdue(dueAt, afterDeadline)).toBe(true)
    })
  })

  describe('customer deposit order cancellation permissions', () => {
    it('allows customer cancellation in PENDING_CONTRACT before contract is signed', () => {
      expect(canCustomerCancelDepositOrder('PENDING_CONTRACT', null)).toBe(true)
    })

    it('locks customer cancellation once contract is signed', () => {
      expect(canCustomerCancelDepositOrder('PENDING_CONTRACT', '2026-08-02T12:00:00Z')).toBe(false)
      expect(canCustomerCancelDepositOrder('CONTRACT_SIGNED', '2026-08-02T12:00:00Z')).toBe(false)
    })

    it('allows customer cancellation in pre-contract statuses', () => {
      expect(canCustomerCancelDepositOrder('PENDING_DEPOSIT')).toBe(true)
      expect(canCustomerCancelDepositOrder('PENDING_CONFIRMATION')).toBe(true)
      expect(canCustomerCancelDepositOrder('CONFIRMED')).toBe(true)
    })

    it('disallows customer cancellation in post-deposit payment statuses', () => {
      expect(canCustomerCancelDepositOrder('WAITING_VEHICLE')).toBe(false)
      expect(canCustomerCancelDepositOrder('PAID')).toBe(false)
      expect(canCustomerCancelDepositOrder('COMPLETED')).toBe(false)
    })
  })

  describe('legal document access', () => {
    it('keeps signed evidence readable throughout delivery and completion', () => {
      for (const status of ['WAITING_VEHICLE', 'PREPARING_DELIVERY', 'DELIVERED', 'COMPLETED']) {
        expect(getDepositDocumentAccess(status, 'SIGNED')).toBe('READ_ONLY')
      }
      expect(getDepositDocumentAccess('PENDING_CONTRACT', 'PENDING_SIGNATURE')).toBe('SIGN')
      expect(getDepositDocumentAccess('WAITING_VEHICLE', 'PENDING_SIGNATURE')).toBe('NONE')
    })

    it('requires both issue and deadline projections before showing a document CTA', () => {
      expect(hasIssuedDepositDocumentProjection('2026-08-07T00:00:00Z', '2026-08-10T00:00:00Z')).toBe(true)
      expect(hasIssuedDepositDocumentProjection('2026-08-07T00:00:00Z', null)).toBe(false)
    })
  })
})
