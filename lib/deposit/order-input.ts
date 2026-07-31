export type DepositCustomerType = 'personal' | 'corporate'
export type DepositVehicleType = 'car' | 'motorbike'
export type DepositPaymentMethod = 'credit_card' | 'atm' | 'bank_transfer'

export type DepositOrderInput = {
  customerType: DepositCustomerType
  fullName: string
  companyName: string | null
  phoneNumber: string
  email: string
  idCardNumber: string
  province: string
  ward: string
  vehicleType: DepositVehicleType
  vehicleModel: string
  vehicleVariant: string
  exteriorColor: string
  interiorColor: string | null
  optionalPackages: string[]
  paymentMethod: DepositPaymentMethod
  showroom?: string | null
  promotionCode?: string | null
}

export class DepositInputError extends Error {}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^\+?[0-9]{9,15}$/
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DepositInputError('Dữ liệu đặt cọc phải là một object.')
  }
  return value as Record<string, unknown>
}

function text(
  input: Record<string, unknown>,
  key: string,
  label: string,
  options: { required?: boolean; max?: number } = {},
): string {
  const value = typeof input[key] === 'string' ? input[key].trim() : ''
  if (options.required && value === '') {
    throw new DepositInputError(`${label} là bắt buộc.`)
  }
  if (value.length > (options.max ?? 160)) {
    throw new DepositInputError(`${label} quá dài.`)
  }
  return value
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new DepositInputError(`${label} không hợp lệ.`)
  }
  return value as T
}

export function parseDepositOrderInput(body: unknown): DepositOrderInput {
  const input = record(body)
  const allowedKeys = new Set([
    'customer_type',
    'full_name',
    'company_name',
    'phone_number',
    'email',
    'id_card_number',
    'province',
    'ward',
    'vehicle_type',
    'car_model',
    'car_variant',
    'exterior_color',
    'interior_color',
    'optional_packages',
    'payment_method',
    'terms_accepted',
    'showroom',
    'promotion_code',
  ])
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw new DepositInputError('Yêu cầu đặt cọc chứa trường không được hỗ trợ.')
  }

  const customerType = enumValue(
    input.customer_type,
    ['personal', 'corporate'] as const,
    'Loại khách hàng',
  )
  const fullName = text(input, 'full_name', 'Họ và tên', {
    required: customerType === 'personal',
    max: 120,
  })
  const companyName = text(input, 'company_name', 'Tên doanh nghiệp', {
    required: customerType === 'corporate',
    max: 180,
  })
  const phoneNumber = text(input, 'phone_number', 'Số điện thoại', {
    required: true,
    max: 20,
  }).replace(/[\s.-]/g, '')
  const email = text(input, 'email', 'Email', { required: true, max: 254 }).toLowerCase()
  const idCardNumber = text(input, 'id_card_number', 'Số giấy tờ', {
    required: true,
    max: 30,
  })

  if (!PHONE_PATTERN.test(phoneNumber)) {
    throw new DepositInputError('Số điện thoại phải gồm 9 đến 15 chữ số.')
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw new DepositInputError('Email không hợp lệ.')
  }
  if (idCardNumber.length < 6) {
    throw new DepositInputError('Số giấy tờ phải có ít nhất 6 ký tự.')
  }
  if (input.terms_accepted !== true) {
    throw new DepositInputError('Bạn cần đồng ý Điều kiện & Điều khoản.')
  }

  const optionalPackages = Array.isArray(input.optional_packages)
    ? [...new Set(input.optional_packages.map((item) => String(item).trim()).filter(Boolean))]
    : []
  if (optionalPackages.length > 20) {
    throw new DepositInputError('Số gói tùy chọn vượt quá giới hạn.')
  }

  return {
    customerType,
    fullName,
    companyName: companyName || null,
    phoneNumber,
    email,
    idCardNumber,
    province: text(input, 'province', 'Tỉnh/Thành phố', { required: true, max: 120 }),
    ward: text(input, 'ward', 'Xã/Phường', { required: true, max: 120 }),
    vehicleType: enumValue(input.vehicle_type, ['car', 'motorbike'] as const, 'Loại xe'),
    vehicleModel: text(input, 'car_model', 'Mẫu xe', { required: true, max: 120 }),
    vehicleVariant: text(input, 'car_variant', 'Phiên bản xe', { required: true, max: 180 }),
    exteriorColor: text(input, 'exterior_color', 'Màu ngoại thất', { required: true, max: 120 }),
    interiorColor: text(input, 'interior_color', 'Màu nội thất', { max: 120 }) || null,
    optionalPackages,
    paymentMethod: enumValue(
      input.payment_method,
      ['credit_card', 'atm', 'bank_transfer'] as const,
      'Phương thức thanh toán',
    ),
    showroom: input.showroom ? text(input, 'showroom', 'Showroom', { max: 120 }) : null,
    promotionCode: input.promotion_code ? text(input, 'promotion_code', 'Mã khuyến mãi', { max: 20 }) : null,
  }
}

export function parseIdempotencyKey(value: string | null): string {
  const key = value?.trim() ?? ''
  if (!IDEMPOTENCY_PATTERN.test(key)) {
    throw new DepositInputError('Thiếu hoặc sai Idempotency-Key.')
  }
  return key
}

