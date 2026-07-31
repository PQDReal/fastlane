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
  provinceCode: string
  ward: string
  wardCode: string
  vehicleType: DepositVehicleType
  vehicleModel: string
  vehicleVariant: string
  exteriorColor: string
  interiorColor: string | null
  optionalPackages: string[]
  promotionCode: string | null
  paymentMethod: DepositPaymentMethod
  showroom: string | null
}

export type DepositSelectionInput = Pick<
  DepositOrderInput,
  | 'vehicleType'
  | 'vehicleModel'
  | 'vehicleVariant'
  | 'exteriorColor'
  | 'interiorColor'
  | 'optionalPackages'
  | 'promotionCode'
>

export type DepositCustomerField =
  | 'fullName'
  | 'companyName'
  | 'phoneNumber'
  | 'email'
  | 'idCardNumber'
  | 'provinceCode'
  | 'wardCode'

export class DepositInputError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message)
    this.name = 'DepositInputError'
  }
}

const VIETNAM_PHONE_PATTERN = /^0(?:3|5|7|8|9)[0-9]{8}$/
const BUSINESS_ID_PATTERN = /^[0-9]{10}(?:-[0-9]{3})?$/
const NAME_PATTERN = /^[\p{L}\p{M}]+(?:[ .'-][\p{L}\p{M}]+)*$/u
const COMPANY_NAME_PATTERN = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .,()&+'’/_-]*$/u
const LOCATION_CODE_PATTERN = /^[0-9]{1,12}$/
const OPTION_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const PROMOTION_CODE_PATTERN = /^[A-Z0-9_-]{3,64}$/
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/
const UNSAFE_TEXT_PATTERN = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/u

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
  const rawValue = typeof input[key] === 'string' ? input[key] : ''
  if (UNSAFE_TEXT_PATTERN.test(rawValue)) {
    throw new DepositInputError(`${label} chứa ký tự không được hỗ trợ.`, key)
  }
  const value = rawValue.normalize('NFC').trim().replace(/\s+/g, ' ')
  if (options.required && value === '') {
    throw new DepositInputError(`${label} là bắt buộc.`, key)
  }
  if (value.length > (options.max ?? 160)) {
    throw new DepositInputError(`${label} quá dài.`, key)
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

function normalizeVietnamPhone(value: string) {
  const compact = value.replace(/[\s().-]/g, '')
  return compact.startsWith('+84') ? `0${compact.slice(3)}` : compact
}

function validEmail(value: string) {
  if (value.length < 6 || value.length > 254 || value.includes('..')) return false
  const separator = value.lastIndexOf('@')
  if (separator <= 0 || separator !== value.indexOf('@')) return false

  const local = value.slice(0, separator)
  const domain = value.slice(separator + 1)
  if (
    local.length > 64 ||
    local.startsWith('.') ||
    local.endsWith('.') ||
    !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)
  ) return false

  const labels = domain.split('.')
  if (labels.length < 2 || !/^[A-Za-z]{2,63}$/.test(labels.at(-1) ?? '')) return false
  return labels.every(
    (label) =>
      label.length >= 1 &&
      label.length <= 63 &&
      /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label),
  )
}

function validPersonalId(value: string) {
  const normalized = value.toUpperCase()
  if (/^([0-9])\1+$/.test(normalized)) return false
  if (/^[0-9]{9}$/.test(normalized)) return true
  if (/^[A-Z][0-9]{7}$/.test(normalized)) {
    return !/^([A-Z])0{7}$/.test(normalized)
  }
  if (!/^[0-9]{12}$/.test(normalized)) return false

  const provinceCode = Number(normalized.slice(0, 3))
  const centuryGenderCode = Number(normalized[3])
  const birthYear = Number(normalized.slice(4, 6))
  const fullBirthYear = 1900 + Math.floor(centuryGenderCode / 2) * 100 + birthYear
  const currentYear = new Date().getFullYear()
  return provinceCode >= 1 && provinceCode <= 96 && fullBirthYear <= currentYear
}

function validVietnamTaxId(value: string) {
  if (!BUSINESS_ID_PATTERN.test(value)) return false
  const base = value.slice(0, 10)
  const weights = [31, 29, 23, 19, 17, 13, 7, 5, 3]
  const sum = weights.reduce(
    (total, weight, index) => total + Number(base[index]) * weight,
    0,
  )
  const checkDigit = 10 - (sum % 11)
  return checkDigit < 10 && checkDigit === Number(base[9])
}

function customerFieldErrors(input: {
  customerType: DepositCustomerType
  fullName: string
  companyName: string
  phoneNumber: string
  email: string
  idCardNumber: string
  provinceCode: string
  wardCode: string
}): Partial<Record<DepositCustomerField, string>> {
  const errors: Partial<Record<DepositCustomerField, string>> = {}
  if (input.customerType === 'personal') {
    if (!input.fullName) errors.fullName = 'Vui lòng nhập họ và tên.'
    else if (
      input.fullName.length < 2 ||
      input.fullName.length > 120 ||
      !NAME_PATTERN.test(input.fullName)
    ) {
      errors.fullName = 'Họ và tên phải từ 2–120 ký tự và không chứa số hoặc ký tự đặc biệt.'
    }
  } else {
    if (!input.companyName) errors.companyName = 'Vui lòng nhập tên doanh nghiệp.'
    else if (
      input.companyName.length < 2 ||
      input.companyName.length > 180 ||
      !COMPANY_NAME_PATTERN.test(input.companyName) ||
      !/[\p{L}\p{M}]/u.test(input.companyName)
    ) {
      errors.companyName = 'Tên doanh nghiệp phải từ 2–180 ký tự và không chứa ký tự không hợp lệ.'
    }
  }
  if (!VIETNAM_PHONE_PATTERN.test(input.phoneNumber)) {
    errors.phoneNumber = 'Số điện thoại Việt Nam phải có 10 chữ số và đầu số hợp lệ.'
  }
  if (!validEmail(input.email)) {
    errors.email = 'Email phải có đúng định dạng, ví dụ ten@example.com.'
  }
  if (input.customerType === 'personal') {
    if (!validPersonalId(input.idCardNumber)) {
      errors.idCardNumber = 'CCCD/CMND/Hộ chiếu không đúng định dạng hoặc chứa thông tin không hợp lệ.'
    }
  } else if (!validVietnamTaxId(input.idCardNumber)) {
    errors.idCardNumber = 'Mã số thuế không đúng định dạng hoặc sai chữ số kiểm tra.'
  }
  if (!LOCATION_CODE_PATTERN.test(input.provinceCode)) {
    errors.provinceCode = 'Vui lòng chọn Tỉnh/Thành phố từ danh sách.'
  }
  if (!LOCATION_CODE_PATTERN.test(input.wardCode)) {
    errors.wardCode = 'Vui lòng chọn Xã/Phường từ danh sách.'
  }
  return errors
}

export function validateDepositCustomerDetails(input: {
  customerType: DepositCustomerType
  fullName: string
  companyName: string
  phoneNumber: string
  email: string
  idCardNumber: string
  provinceCode: string
  wardCode: string
}) {
  return customerFieldErrors({
    ...input,
    fullName: input.fullName.normalize('NFC').trim().replace(/\s+/g, ' '),
    companyName: input.companyName.normalize('NFC').trim().replace(/\s+/g, ' '),
    phoneNumber: normalizeVietnamPhone(input.phoneNumber),
    email: input.email.trim().toLowerCase(),
    idCardNumber: input.idCardNumber.trim().toUpperCase(),
    provinceCode: input.provinceCode.trim(),
    wardCode: input.wardCode.trim(),
  })
}

function optionalPackageValues(value: unknown) {
  if (!Array.isArray(value)) {
    if (value === undefined) return []
    throw new DepositInputError('Gói tùy chọn phải là một danh sách.', 'optional_packages')
  }
  const packages = [...new Set(value.map((item) => String(item).trim()).filter(Boolean))]
  if (packages.length > 20) {
    throw new DepositInputError('Số gói tùy chọn vượt quá giới hạn.', 'optional_packages')
  }
  if (packages.some((item) => !OPTION_KEY_PATTERN.test(item))) {
    throw new DepositInputError('Gói tùy chọn chứa mã không hợp lệ.', 'optional_packages')
  }
  return packages
}

function promotionCode(value: unknown) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (code && !PROMOTION_CODE_PATTERN.test(code)) {
    throw new DepositInputError('Mã ưu đãi không hợp lệ.', 'promotion_code')
  }
  return code || null
}

export function parseDepositSelectionInput(body: unknown): DepositSelectionInput {
  const input = record(body)
  const allowedKeys = new Set([
    'vehicle_type',
    'car_model',
    'car_variant',
    'exterior_color',
    'interior_color',
    'optional_packages',
    'promotion_code',
  ])
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw new DepositInputError('Yêu cầu báo giá chứa trường không được hỗ trợ.')
  }
  return {
    vehicleType: enumValue(input.vehicle_type, ['car', 'motorbike'] as const, 'Loại xe'),
    vehicleModel: text(input, 'car_model', 'Mẫu xe', { required: true, max: 120 }),
    vehicleVariant: text(input, 'car_variant', 'Phiên bản xe', { required: true, max: 180 }),
    exteriorColor: text(input, 'exterior_color', 'Màu ngoại thất', { required: true, max: 120 }),
    interiorColor: text(input, 'interior_color', 'Màu nội thất', { max: 120 }) || null,
    optionalPackages: optionalPackageValues(input.optional_packages),
    promotionCode: promotionCode(input.promotion_code),
  }
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
    'province_code',
    'ward',
    'ward_code',
    'vehicle_type',
    'car_model',
    'car_variant',
    'exterior_color',
    'interior_color',
    'optional_packages',
    'promotion_code',
    'payment_method',
    'terms_accepted',
    'showroom',
  ])
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw new DepositInputError('Yêu cầu đặt cọc chứa trường không được hỗ trợ.')
  }

  const customerType = enumValue(
    input.customer_type,
    ['personal', 'corporate'] as const,
    'Loại khách hàng',
  )
  const submittedFullName = text(input, 'full_name', 'Họ và tên', {
    required: customerType === 'personal',
    max: 120,
  })
  const submittedCompanyName = text(input, 'company_name', 'Tên doanh nghiệp', {
    required: customerType === 'corporate',
    max: 180,
  })
  const fullName = customerType === 'personal' ? submittedFullName : ''
  const companyName = customerType === 'corporate' ? submittedCompanyName : ''
  const phoneNumber = normalizeVietnamPhone(text(input, 'phone_number', 'Số điện thoại', {
    required: true,
    max: 20,
  }))
  const email = text(input, 'email', 'Email', { required: true, max: 254 }).toLowerCase()
  const idCardNumber = text(input, 'id_card_number', 'Số giấy tờ', {
    required: true,
    max: 30,
  }).toUpperCase()

  const provinceCode = text(input, 'province_code', 'Mã Tỉnh/Thành phố', {
    required: true,
    max: 12,
  })
  const wardCode = text(input, 'ward_code', 'Mã Xã/Phường', {
    required: true,
    max: 12,
  })
  const errors = customerFieldErrors({
    customerType,
    fullName,
    companyName,
    phoneNumber,
    email,
    idCardNumber,
    provinceCode,
    wardCode,
  })
  const firstError = Object.entries(errors)[0]
  if (firstError) throw new DepositInputError(firstError[1], firstError[0])
  if (input.terms_accepted !== true) {
    throw new DepositInputError('Bạn cần đồng ý Điều kiện & Điều khoản.', 'terms_accepted')
  }

  const selection = parseDepositSelectionInput({
    vehicle_type: input.vehicle_type,
    car_model: input.car_model,
    car_variant: input.car_variant,
    exterior_color: input.exterior_color,
    interior_color: input.interior_color,
    optional_packages: input.optional_packages,
    promotion_code: input.promotion_code,
  })

  return {
    customerType,
    fullName,
    companyName: companyName || null,
    phoneNumber,
    email,
    idCardNumber,
    province: text(input, 'province', 'Tỉnh/Thành phố', { required: true, max: 120 }),
    provinceCode,
    ward: text(input, 'ward', 'Xã/Phường', { required: true, max: 120 }),
    wardCode,
    ...selection,
    paymentMethod: enumValue(
      input.payment_method,
      ['credit_card', 'atm', 'bank_transfer'] as const,
      'Phương thức thanh toán',
    ),
    showroom: input.showroom ? text(input, 'showroom', 'Showroom', { max: 120 }) : null,
  }
}

export function parseIdempotencyKey(value: string | null): string {
  const key = value?.trim() ?? ''
  if (!IDEMPOTENCY_PATTERN.test(key)) {
    throw new DepositInputError('Thiếu hoặc sai Idempotency-Key.')
  }
  return key
}

