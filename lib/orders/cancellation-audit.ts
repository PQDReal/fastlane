export type CancellationActorType = 'CUSTOMER' | 'ADMIN' | 'SYSTEM' | 'UNKNOWN'

export type OrderCancellationAudit = {
  actorType: CancellationActorType
  actorUserId: string | null
  actorEmail: string | null
  reasonCode: string | null
  note: string | null
  cancelledAt: string | null
  auditVersion: number | null
  isLegacy: boolean
  timeInferred: boolean
}

const reasonLabels: Record<string, string> = {
  changed_mind: 'Khách hàng thay đổi quyết định',
  configuration_change: 'Khách hàng muốn thay đổi cấu hình',
  payment_unavailable: 'Không thể tiếp tục thanh toán',
  duplicate_order: 'Đơn hàng bị tạo trùng',
  payment_deadline_expired: 'Quá hạn thanh toán',
  inventory_unavailable: 'Không còn hàng để thực hiện đơn',
  admin_decision: 'Quản trị viên quyết định hủy',
  other: 'Lý do khác',
  CUSTOMER_CANCELLED_BEFORE_CONTRACT: 'Khách hàng hủy trước khi phát hành tài liệu',
  CUSTOMER_CANCELLED_PENDING_SIGNATURE: 'Khách hàng hủy khi đang chờ ký tài liệu',
  CONTRACT_SIGNATURE_EXPIRED: 'Hết thời hạn ký tài liệu',
  ADMIN_CANCELLED_BEFORE_CONTRACT: 'Quản trị viên hủy trước khi ký tài liệu',
}

export function cancellationReasonLabel(reasonCode: string | null) {
  if (!reasonCode) return 'Không có mã lý do'
  return reasonLabels[reasonCode] ?? reasonCode
}
