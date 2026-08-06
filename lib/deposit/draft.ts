export const DEPOSIT_DRAFT_VERSION = 1 as const

export type DepositDraft = {
  version: typeof DEPOSIT_DRAFT_VERSION
  currentStep: 1 | 2 | 3
  vehicleType: 'car' | 'motorbike'
  selectedCarId: string
  selectedVariant: string
  selectedColor: string
  selectedInteriorColor: string
  selectedPackages: string[]
  customerType: 'personal' | 'corporate'
  formData: {
    name: string
    phone: string
    email: string
    idCard: string
    taxId: string
    companyName: string
    province: string
    ward: string
  }
  provinceCode: string
  wardCode: string
  selectedShowroomId: string | null
  promotionCode: string
}

export type StoredDepositDraft = DepositDraft & {
  savedAt: string
}

export class DepositDraftValidationError extends Error {}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DepositDraftValidationError(`${field} không hợp lệ.`)
  }
  return value as Record<string, unknown>
}

function text(value: unknown, field: string, maximum: number) {
  if (typeof value !== 'string' || value.length > maximum) {
    throw new DepositDraftValidationError(`${field} không hợp lệ.`)
  }
  return value
}

export function parseDepositDraft(value: unknown): DepositDraft {
  const input = record(value, 'Dữ liệu nháp')
  const form = record(input.formData, 'Thông tin khách hàng')
  const step = input.currentStep
  if (step !== 1 && step !== 2 && step !== 3) {
    throw new DepositDraftValidationError('Bước đặt cọc không hợp lệ.')
  }
  if (input.vehicleType !== 'car' && input.vehicleType !== 'motorbike') {
    throw new DepositDraftValidationError('Loại phương tiện không hợp lệ.')
  }
  if (input.customerType !== 'personal' && input.customerType !== 'corporate') {
    throw new DepositDraftValidationError('Loại khách hàng không hợp lệ.')
  }
  if (!Array.isArray(input.selectedPackages) || input.selectedPackages.length > 30) {
    throw new DepositDraftValidationError('Danh sách gói tùy chọn không hợp lệ.')
  }

  const selectedPackages = [...new Set(input.selectedPackages.map((entry) =>
    text(entry, 'Gói tùy chọn', 120),
  ))]
  const showroomId = input.selectedShowroomId
  if (showroomId !== null && typeof showroomId !== 'string') {
    throw new DepositDraftValidationError('Showroom không hợp lệ.')
  }

  return {
    version: DEPOSIT_DRAFT_VERSION,
    currentStep: step,
    vehicleType: input.vehicleType,
    selectedCarId: text(input.selectedCarId, 'Mẫu xe', 180),
    selectedVariant: text(input.selectedVariant, 'Phiên bản', 240),
    selectedColor: text(input.selectedColor, 'Màu ngoại thất', 120),
    selectedInteriorColor: text(input.selectedInteriorColor, 'Màu nội thất', 120),
    selectedPackages,
    customerType: input.customerType,
    formData: {
      name: text(form.name, 'Họ tên', 120),
      phone: text(form.phone, 'Số điện thoại', 20),
      email: text(form.email, 'Email', 254),
      idCard: text(form.idCard, 'Giấy tờ tùy thân', 20),
      // Bản nháp cũ chưa có taxId vẫn phải khôi phục được mà không sao chép CCCD.
      taxId: form.taxId === undefined
        ? ''
        : text(form.taxId, 'Số đăng ký kinh doanh / Mã số thuế', 14),
      companyName: text(form.companyName, 'Tên doanh nghiệp', 180),
      province: text(form.province, 'Tỉnh/Thành phố', 120),
      ward: text(form.ward, 'Xã/Phường', 120),
    },
    provinceCode: text(input.provinceCode, 'Mã Tỉnh/Thành phố', 20),
    wardCode: text(input.wardCode, 'Mã Xã/Phường', 20),
    selectedShowroomId: showroomId === null
      ? null
      : text(showroomId, 'Showroom', 100),
    promotionCode: text(input.promotionCode, 'Mã ưu đãi', 40),
  }
}
