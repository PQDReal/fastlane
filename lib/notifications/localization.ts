const STATUS_LABELS: Record<string, string> = {
  PENDING_DEPOSIT: 'Chờ thanh toán tiền cọc',
  PENDING_CONFIRMATION: 'Chờ xét duyệt tiền cọc',
  PENDING_CONTRACT: 'Chờ ký hợp đồng',
  CONTRACT_SIGNED: 'Đã ký hợp đồng',
  WAITING_VEHICLE: 'Chờ xe',
  PENDING_PAYMENT: 'Chờ thanh toán',
  PREPARING_DELIVERY: 'Đang chuẩn bị bàn giao',
  PENDING_SIGNATURE: 'Chờ ký',
  REFUND_PROCESSING: 'Đang xử lý hoàn tiền',
  REFUND_COMPLETED: 'Đã hoàn tiền',
  REFUND_FAILED: 'Hoàn tiền thất bại',
  REFUND_QUEUED: 'Chờ xử lý hoàn tiền',
  PREPARING: 'Đang chuẩn bị hàng',
  PROCESSING: 'Đang xử lý',
  CONFIRMED: 'Đã xác nhận',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
  DELIVERED: 'Đã bàn giao',
  SHIPPED: 'Đang giao hàng',
  PENDING: 'Chờ xử lý',
  PAID: 'Đã thanh toán',
  SIGNED: 'Đã ký',
  DRAFT: 'Bản nháp',
  FAILED: 'Thất bại',
  APPROVED: 'Đã phê duyệt',
  DECLINED: 'Đã từ chối',
  REVIEW: 'Đang xem xét',
}

const STATUS_CODE_PATTERN = new RegExp(
  `(^|[^A-Z0-9_-])(${Object.keys(STATUS_LABELS).sort((left, right) => right.length - left.length).join('|')})(?=$|[^A-Z0-9_-])`,
  'g',
)

export function localizeNotificationText(value: string) {
  return value.replace(
    STATUS_CODE_PATTERN,
    (_match, prefix: string, status: string) => `${prefix}${STATUS_LABELS[status] ?? status}`,
  )
}
