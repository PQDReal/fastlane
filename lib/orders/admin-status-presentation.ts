export type AdminOrderRefundStatus = 'NONE' | 'PENDING' | 'COMPLETED'

export type AccessoryAdminOrderStatus =
  | 'PENDING'
  | 'PAID'
  | 'CONFIRMED'
  | 'READY'
  | 'DELIVERED'
  | 'CANCELLED'

export type AdminOrderStatusTone =
  | 'neutral'
  | 'pending'
  | 'info'
  | 'contract'
  | 'waiting'
  | 'fulfillment'
  | 'delivery'
  | 'success'
  | 'cancelled'
  | 'refundPending'

export type AdminOrderStatusPresentation = {
  label: string
  tone: AdminOrderStatusTone
  className: string
}

export const adminOrderStatusToneClassName: Record<AdminOrderStatusTone, string> = {
  neutral: 'border-slate-200 bg-slate-100 text-slate-700',
  pending: 'border-amber-200 bg-amber-100 text-amber-800',
  info: 'border-blue-200 bg-blue-100 text-blue-700',
  contract: 'border-indigo-200 bg-indigo-100 text-indigo-700',
  waiting: 'border-sky-200 bg-sky-100 text-sky-700',
  fulfillment: 'border-violet-200 bg-violet-100 text-violet-700',
  delivery: 'border-teal-200 bg-teal-100 text-teal-700',
  success: 'border-emerald-200 bg-emerald-100 text-emerald-700',
  cancelled: 'border-red-200 bg-red-100 text-red-700',
  refundPending: 'border-orange-200 bg-orange-100 text-orange-700',
}

function presentation(label: string, tone: AdminOrderStatusTone): AdminOrderStatusPresentation {
  return { label, tone, className: adminOrderStatusToneClassName[tone] }
}

export function cancelledOrderStatusPresentation(
  refundStatus: AdminOrderRefundStatus,
): AdminOrderStatusPresentation {
  if (refundStatus === 'COMPLETED') return presentation('Đã hủy, đã hoàn tiền', 'cancelled')
  if (refundStatus === 'PENDING') return presentation('Đã hủy, chờ admin xác nhận hoàn tiền', 'refundPending')
  return presentation('Đã hủy', 'cancelled')
}

export function refundStatusPresentation(
  refundStatus: AdminOrderRefundStatus,
): AdminOrderStatusPresentation {
  if (refundStatus === 'COMPLETED') return presentation('Đã hoàn tiền', 'success')
  if (refundStatus === 'PENDING') return presentation('Đang chờ hoàn tiền', 'refundPending')
  return presentation('Không phát sinh', 'neutral')
}

export function accessoryOrderStatusPresentation(
  status: AccessoryAdminOrderStatus,
  refundStatus: AdminOrderRefundStatus,
): AdminOrderStatusPresentation {
  if (status === 'CANCELLED') return cancelledOrderStatusPresentation(refundStatus)

  const statuses: Record<Exclude<AccessoryAdminOrderStatus, 'CANCELLED'>, [string, AdminOrderStatusTone]> = {
    PENDING: ['Đang chờ thanh toán', 'pending'],
    PAID: ['Đã thanh toán', 'success'],
    CONFIRMED: ['Đã xác nhận', 'info'],
    READY: ['Đang giao hàng', 'delivery'],
    DELIVERED: ['Hoàn thành', 'success'],
  }
  const [label, tone] = statuses[status]
  return presentation(label, tone)
}

type VehicleOrderStatusInput = {
  status: string
  refundStatus: AdminOrderRefundStatus
  payment: string
  vehicleType?: string
}

export function depositPaymentStatusPresentation(
  input: Pick<VehicleOrderStatusInput, 'status' | 'refundStatus' | 'payment'>,
): AdminOrderStatusPresentation {
  if (input.status === 'CANCELLED') {
    return cancelledOrderStatusPresentation(input.refundStatus)
  }
  return input.payment === 'Paid'
    ? presentation('Đã đặt cọc', 'success')
    : presentation('Chờ thanh toán cọc', 'pending')
}

export function vehicleOrderStatusPresentation(
  input: VehicleOrderStatusInput,
): AdminOrderStatusPresentation {
  if (input.status === 'CANCELLED' || input.status === 'Cancelled') {
    return cancelledOrderStatusPresentation(input.refundStatus)
  }

  if (['PENDING_DEPOSIT', 'PENDING_CONFIRMATION', 'PENDING', 'Pending'].includes(input.status)) {
    return depositPaymentStatusPresentation(input)
  }

  const labels: Record<string, [string, AdminOrderStatusTone]> = {
    CONFIRMED: ['Đã xác nhận', 'info'],
    Confirmed: ['Đã xác nhận', 'info'],
    PENDING_CONTRACT: ['Chờ ký hợp đồng', 'contract'],
    CONTRACT_SIGNED: ['Chờ nhận xe', 'success'],
    WAITING_VEHICLE: ['Chờ xe sẵn sàng', 'waiting'],
    PREPARING_DELIVERY: ['Chờ giao xe', 'fulfillment'],
    Preparing: ['Đang chuẩn bị', 'fulfillment'],
    DELIVERED: ['Đã giao xe', 'delivery'],
    Shipped: ['Đang giao hàng', 'delivery'],
    COMPLETED: ['Hoàn thành', 'success'],
    Completed: ['Giao thành công', 'success'],
  }
  const [label, tone] = labels[input.status] ?? [input.status, 'neutral']
  return presentation(label, tone)
}
