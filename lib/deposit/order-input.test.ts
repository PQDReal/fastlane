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
    id_card_number: '001201234567',
    province: 'Hà Nội',
    province_code: '1',
    ward: 'Phường Ba Đình',
    ward_code: '4',
    vehicle_type: 'motorbike',
    car_model: 'Amio',
    car_variant: 'Amio Bản tiêu chuẩn',
    exterior_color: 'Đỏ tươi',
    interior_color: '',
    optional_packages: ['pin-phu', 'pin-phu'],
    promotion_code: ' summer10 ',
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
      promotionCode: 'SUMMER10',
      provinceCode: '1',
      wardCode: '4',
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
    })).toThrow('Email phải có đúng định dạng')
    expect(() => parseDepositOrderInput({
      ...validInput(),
      phone_number: '0123456789',
    })).toThrow('đầu số hợp lệ')
    expect(() => parseDepositOrderInput({
      ...validInput(),
      id_card_number: '123456',
    })).toThrow('CCCD/CMND/Hộ chiếu không đúng định dạng')
  })

  it('requires location identifiers selected from the location API', () => {
    expect(() => parseDepositOrderInput({
      ...validInput(),
      province_code: '',
    })).toThrow('Mã Tỉnh/Thành phố là bắt buộc')
    expect(() => parseDepositOrderInput({
      ...validInput(),
      ward_code: 'not-a-code',
    })).toThrow('Xã/Phường từ danh sách')
  })

  it('validates corporate tax identifiers', () => {
    expect(parseDepositOrderInput({
      ...validInput(),
      customer_type: 'corporate',
      full_name: '',
      company_name: 'FastLane Việt Nam',
      id_card_number: '0100109106-001',
    })).toMatchObject({
      customerType: 'corporate',
      idCardNumber: '0100109106-001',
    })

    expect(() => parseDepositOrderInput({
      ...validInput(),
      customer_type: 'corporate',
      full_name: '',
      company_name: 'FastLane Việt Nam',
      id_card_number: '0123456789',
    })).toThrow('chữ số kiểm tra')
  })

  it('rejects malformed names and unsafe hidden characters', () => {
    expect(() => parseDepositOrderInput({
      ...validInput(),
      full_name: 'Nguyễn 123',
    })).toThrow('không chứa số')
    expect(() => parseDepositOrderInput({
      ...validInput(),
      full_name: 'Nguyễn\u200B Văn A',
    })).toThrow('ký tự không được hỗ trợ')
    expect(() => parseDepositOrderInput({
      ...validInput(),
      customer_type: 'corporate',
      full_name: '',
      company_name: '<script>',
      id_card_number: '0100109106',
    })).toThrow('Tên doanh nghiệp')
  })

  it('rejects structurally invalid identity documents', () => {
    expect(() => parseDepositOrderInput({
      ...validInput(),
      id_card_number: '000000000000',
    })).toThrow('không đúng định dạng')
    expect(() => parseDepositOrderInput({
      ...validInput(),
      id_card_number: '001234567890',
    })).toThrow('không đúng định dạng')
    expect(parseDepositOrderInput({
      ...validInput(),
      id_card_number: 'B1234567',
    })).toMatchObject({ idCardNumber: 'B1234567' })
  })

  it('rejects ambiguous or malformed email addresses', () => {
    for (const email of [
      'customer..name@example.com',
      '.customer@example.com',
      'customer@example',
      'customer@-example.com',
      'customer@example.c',
    ]) {
      expect(() => parseDepositOrderInput({
        ...validInput(),
        email,
      })).toThrow('Email phải có đúng định dạng')
    }
  })

  it('validates a stable idempotency key', () => {
    expect(parseIdempotencyKey('deposit-request-123')).toBe('deposit-request-123')
    expect(() => parseIdempotencyKey('short')).toThrow('Idempotency-Key')
  })
})

