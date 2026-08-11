import { AlertTriangle, Clock3, UserRoundX } from 'lucide-react'

import {
  cancellationReasonLabel,
  type OrderCancellationAudit,
} from '@/lib/orders/cancellation-audit'

type OrderCancellationAuditProps = {
  audit: OrderCancellationAudit
}

const dateTime = (value: string) => new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}).format(new Date(value))

const actorLabel: Record<OrderCancellationAudit['actorType'], string> = {
  ADMIN: 'Quản trị viên',
  CUSTOMER: 'Khách hàng',
  SYSTEM: 'Hệ thống',
  UNKNOWN: 'Không xác định',
}

export function OrderCancellationAuditCard({ audit }: OrderCancellationAuditProps) {
  const identityMissing = ['ADMIN', 'CUSTOMER'].includes(audit.actorType) && !audit.actorUserId

  return <section className="rounded-xl border border-red-200 bg-red-50 p-4">
    <div className="flex items-center gap-2 text-red-800">
      <UserRoundX aria-hidden="true" size={18} />
      <h3 className="font-semibold">Thông tin hủy đơn</h3>
    </div>

    <dl className="mt-4 space-y-3 text-sm">
      <div className="flex items-start justify-between gap-4">
        <dt className="text-red-700/70">Người hủy</dt>
        <dd className="max-w-[68%] text-right font-semibold text-red-900">
          <span className="block">{actorLabel[audit.actorType]}</span>
          {audit.actorEmail && <span className="mt-0.5 block break-all text-xs font-medium text-red-700">{audit.actorEmail}</span>}
          {audit.actorUserId && <code className="mt-0.5 block break-all text-[10px] font-normal text-red-600">ID: {audit.actorUserId}</code>}
        </dd>
      </div>
      <div className="flex items-start justify-between gap-4">
        <dt className="text-red-700/70">Lý do</dt>
        <dd className="max-w-[68%] text-right font-medium text-red-900">
          <span className="block">{cancellationReasonLabel(audit.reasonCode)}</span>
          {audit.reasonCode && <code className="mt-0.5 block text-[10px] font-normal text-red-600">{audit.reasonCode}</code>}
        </dd>
      </div>
      {audit.note && <div className="flex items-start justify-between gap-4">
        <dt className="text-red-700/70">Ghi chú</dt>
        <dd className="max-w-[68%] text-right font-medium text-red-900">{audit.note}</dd>
      </div>}
      <div className="flex items-start justify-between gap-4">
        <dt className="text-red-700/70">Thời điểm</dt>
        <dd className="flex items-center justify-end gap-1.5 text-right font-medium text-red-900">
          <Clock3 aria-hidden="true" size={14} />
          {audit.cancelledAt ? dateTime(audit.cancelledAt) : 'Không xác định'}
        </dd>
      </div>
    </dl>

    {(audit.isLegacy || audit.timeInferred || identityMissing) && <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
      <AlertTriangle aria-hidden="true" size={15} className="mt-0.5 shrink-0" />
      <p>
        Dữ liệu cũ được phục dựng từ trạng thái đã lưu.
        {identityMissing ? ' Không xác định được chính xác tài khoản thao tác.' : ''}
        {audit.timeInferred ? ' Thời điểm hiển thị là lần cập nhật gần nhất của đơn.' : ''}
      </p>
    </div>}
  </section>
}
