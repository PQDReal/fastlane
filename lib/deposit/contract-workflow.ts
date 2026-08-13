export type DepositContractMode = 'CAR_SALES' | 'BIKE_PURCHASE_TERMS'

type ContractOrderLike = {
  vehicle_type?: string | null
  car_variant?: string | null
  vehicle_variants?: {
    product_type?: string | null
    variant_name?: string | null
    version?: string | null
  } | Array<{
    product_type?: string | null
    variant_name?: string | null
    version?: string | null
  }> | null
}

export const DEPOSIT_ORDER_JOURNEY_STEPS = [
  'Chờ xét duyệt',
  'Xác thực KYC',
  'Ký hợp đồng',
  'Chờ xe',
  'Nhận xe',
] as const

/** Derives the document shown at stage 3 from persisted, schema-backed order data. */
export function getDepositContractMode(order: ContractOrderLike): DepositContractMode {
  const vehicleType = order.vehicle_type?.trim().toLowerCase()
  if (vehicleType === 'motorbike') return 'BIKE_PURCHASE_TERMS'
  if (vehicleType === 'car') return 'CAR_SALES'

  const variant = Array.isArray(order.vehicle_variants)
    ? order.vehicle_variants[0]
    : order.vehicle_variants
  const productType = variant?.product_type?.trim().toLowerCase()
  return productType === 'bike' || productType === 'motorbike'
    ? 'BIKE_PURCHASE_TERMS'
    : 'CAR_SALES'
}
export function contractStageCopy(mode: DepositContractMode) {
  if (mode === 'BIKE_PURCHASE_TERMS') return {
    status: 'Ký hợp đồng: Thỏa thuận đặt mua đã sẵn sàng. Vui lòng xem và xác nhận.',
    action: 'Xem & Ký hợp đồng',
    title: 'THỎA THUẬN ĐẶT MUA XE MÁY ĐIỆN VINFAST',
    consent: 'Tôi đã đọc, hiểu rõ và đồng ý với các điều khoản của Thỏa thuận đặt mua xe máy điện VinFast.',
  }
  return {
    status: 'Ký hợp đồng: Hợp đồng mua xe điện tử đã sẵn sàng. Vui lòng xem & ký hợp đồng.',
    action: 'Xem & Ký HĐ',
    title: 'HỢP ĐỒNG MUA BÁN XE Ô TÔ ĐIỆN VINFAST',
    consent: 'Tôi đã đọc, hiểu rõ và đồng ý với toàn bộ các điều khoản của Hợp đồng mua bán xe ô tô điện VinFast.',
  }
}
/** Calculates 72-hour signature deadline from issue timestamp. */
export function calculateContractSignatureDeadline(issuedAt: Date, hours: number = 72): Date {
  return new Date(issuedAt.getTime() + hours * 60 * 60 * 1000)
}

/** Returns true at or after the contract signature deadline. */
export function isContractSignatureOverdue(dueAt: string | Date, now: Date = new Date()): boolean {
  const dueTime = typeof dueAt === 'string' ? new Date(dueAt).getTime() : dueAt.getTime()
  return now.getTime() >= dueTime
}

/** Determines whether a deposit order can be cancelled by the customer. */
export function canCustomerCancelDepositOrder(status: string, contractSignedAt?: string | null): boolean {
  if (contractSignedAt) return false
  const cancellableStatuses = ['PENDING_DEPOSIT', 'PENDING_CONFIRMATION', 'PENDING', 'CONFIRMED', 'PENDING_CONTRACT']
  return cancellableStatuses.includes(status)
}

export type DepositDocumentAccess = 'SIGN' | 'READ_ONLY' | 'NONE'

/** Signed evidence stays readable after the order advances beyond stage 3. */
export function getDepositDocumentAccess(
  orderStatus: string,
  documentStatus: string | null | undefined,
): DepositDocumentAccess {
  if (documentStatus === 'SIGNED') return 'READ_ONLY'
  if (documentStatus === 'PENDING_SIGNATURE' && orderStatus === 'PENDING_CONTRACT') return 'SIGN'
  return 'NONE'
}

export function hasIssuedDepositDocumentProjection(
  issuedAt: string | null | undefined,
  signatureDueAt: string | null | undefined,
) {
  return Boolean(issuedAt && signatureDueAt)
}
export type AutoIssueCandidate = {
  status: string
  kycStatus: string | null | undefined
  vehicleType: string | null | undefined
  hasPaidDeposit: boolean
}
export function getAutoIssueReadiness(candidate: AutoIssueCandidate): 'READY' | 'NOT_READY' {
  return candidate.status === 'CONFIRMED'
    && candidate.kycStatus === 'APPROVED'
    && (candidate.vehicleType === 'car' || candidate.vehicleType === 'motorbike')
    && candidate.hasPaidDeposit
    ? 'READY'
    : 'NOT_READY'
}
