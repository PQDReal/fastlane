import { describe, expect, it } from 'vitest'

import {
  DepositInputError,
  parseDepositOrderInput,
  parseIdempotencyKey,
} from './order-input'

function validInput() {
  return {
    customer_type: 'personal',
    full_name: 'Nguyễn Văn A',
    company_name: '',
    phone_number: '090 123 4567',
    email: 'CUSTOMER@EXAMPLE.COM',
    id_card_number: '001234567890',
    province: 'Hà Nội',
    ward: 'Phường Ba Đình',
    vehicle_type: 'motorbike',
    car_model: 'Amio',
    car_variant: 'Amio Bản tiêu chuẩn',
    exterior_color: 'Đỏ tươi',
    interior_color: '',
    optional_packages: ['pin-phu', 'pin-phu'],
    payment_method: 'bank_transfer',
    terms_accepted: true,
  }
}

describe('deposit order input', () => {
  it('normalizes a valid deposit request', () => {
    expect(parseDepositOrderInput(validInput())).toMatchObject({
      customerType: 'personal',
      fullName: 'Nguyễn Văn A',
      phoneNumber: '0901234567',
      email: 'customer@example.com',
      vehicleType: 'motorbike',
      optionalPackages: ['pin-phu'],
    })
  })

  it('requires a company name for corporate deposits', () => {
    expect(() => parseDepositOrderInput({
      ...validInput(),
      customer_type: 'corporate',
      full_name: '',
      company_name: '',
    })).toThrow(DepositInputError)
  })

  it('rejects prices and order numbers supplied by the browser', () => {
    expect(() => parseDepositOrderInput({
      ...validInput(),
      order_number: 'FORGED',
      deposit_amount: 1,
    })).toThrow('trường không được hỗ trợ')
  })

  it('requires accepted terms and valid contact data', () => {
    expect(() => parseDepositOrderInput({
      ...validInput(),
      terms_accepted: false,
    })).toThrow('Điều kiện & Điều khoản')
    expect(() => parseDepositOrderInput({
      ...validInput(),
      email: 'invalid',
    })).toThrow('Email không hợp lệ')
  })

  it('validates a stable idempotency key', () => {
    expect(parseIdempotencyKey('deposit-request-123')).toBe('deposit-request-123')
    expect(() => parseIdempotencyKey('short')).toThrow('Idempotency-Key')
  })
})

