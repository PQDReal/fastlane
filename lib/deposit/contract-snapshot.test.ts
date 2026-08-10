import { describe, expect, it } from 'vitest'
import {
  canonicalJsonStringify,
  createCarSalesContractSnapshot,
  createMotorbikeSalesContractSnapshot,
} from './contract-snapshot'

const order = {
  order_number: 'FLD-TEST-001',
  created_at: '2026-08-07T00:00:00.000Z',
  full_name: 'Nguyễn Văn A',
  id_card_number: '012345678901',
  email: 'a@example.com',
  phone_number: '0900000000',
  province: 'Hà Nội',
  ward: 'Cầu Giấy',
  showroom: 'FastLane Hà Nội',
  car_model: 'VF 5',
  car_variant: 'Plus',
  exterior_color: 'Zenith Grey',
  subtotal: 480_000_000,
  discount_amount: 8_800_000,
  promotion_code: 'FASTLANE',
  total_estimated_price: 471_200_000,
  deposit_amount: 15_000_000,
}

describe('contract snapshot', () => {
  it('serializes object keys deterministically', () => {
    expect(canonicalJsonStringify({ b: 2, a: { d: 4, c: 3 } }))
      .toBe(canonicalJsonStringify({ a: { c: 3, d: 4 }, b: 2 }))
  })

  it('captures legal clauses and commercial values in one immutable payload', () => {
    const snapshot = createCarSalesContractSnapshot(order)
    expect(snapshot.documentType).toBe('CAR_SALES_CONTRACT')
    expect(snapshot.legal.payment.paragraphsBeforeBullets[0]).toContain('15.000.000')
    expect(snapshot.legal.otherTerms.paragraphs.length).toBeGreaterThan(5)
    expect(snapshot.expectedDeliveryDate).toBe('06/09/2026')
  })

  it('uses the motorbike purchase terms regardless of the battery option', () => {
    const snapshot = createMotorbikeSalesContractSnapshot({
      ...order,
      car_variant: 'Không kèm Pin (Thuê pin)',
    })
    expect(snapshot.documentType).toBe('MOTORBIKE_SALES_CONTRACT')
    expect(snapshot.consentVersion).toBe('motorbike-sales-consent-2026-08-07.2')
    expect(snapshot.title).toContain('THỎA THUẬN ĐẶT MUA XE MÁY ĐIỆN')
    expect(snapshot.legal.consentText).toContain('Thỏa thuận đặt mua xe máy điện')
    expect(JSON.stringify(snapshot.legal)).not.toContain('Thông báo tín dụng')
    expect(JSON.stringify(snapshot.legal)).not.toContain('eSIM')
    expect(snapshot.legal.payment.paragraphsAfterBullets.join(' '))
      .toContain('chỉ là thành phần cấu hình và giá của xe')
    expect(JSON.stringify(snapshot.legal)).not.toContain('hợp đồng mua pin')
    expect(JSON.stringify(snapshot.legal)).not.toContain('thuê pin riêng')
  })
})
