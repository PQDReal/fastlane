'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, CheckCircle2, FileText, Truck, XCircle, User, MapPin, RotateCcw } from 'lucide-react'
import { AdminOrderRow } from './orders-client'
import {
  confirmDepositRefund,
  notifyVehicleReadyForDelivery,
  runDepositDebugAction,
  updateOrderStatus,
  syncKycStatus,
  type DepositDebugAction,
} from './actions'
import { ToastMessage } from '@/components/ui/toast'

type OrderDetailDrawerProps = {
  order: AdminOrderRow | null
  debugActionsEnabled: boolean
  isOpen: boolean
  onClose: () => void
  onOrderUpdated: () => void
  onShowToast: (toast: Omit<ToastMessage, 'id'>, duration?: number) => number
  onDismissToast: (id: number) => void
}

export function AdminOrderDetailDrawer({ order, debugActionsEnabled, isOpen, onClose, onOrderUpdated, onShowToast, onDismissToast }: OrderDetailDrawerProps) {
  const [isUpdating, setIsUpdating] = useState(false)

  if (!order || !order.rawDeposit) return null

  const d = order.rawDeposit
  const isMotorbike = d.vehicle_type === 'motorbike'
  const hasIssuedDocumentProjection = Boolean(d.contract_issued_at && d.contract_signature_due_at)
  const isRefundProcessing = order.refundStatus === 'PENDING'
    && ['PENDING', 'PROCESSING'].includes(order.refundAttemptStatus ?? '')

  const formatMoney = (val: number) => new Intl.NumberFormat('vi-VN').format(val) + ' ₫'
  const formatDate = (dStr: string) => new Date(dStr).toLocaleDateString('vi-VN', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  })

  const nextActionMap: Record<string, { label: string; icon: any; nextStatus: string }> = {
    'PENDING_CONFIRMATION': { label: 'Xác nhận đơn & duyệt', icon: <CheckCircle2 size={16}/>, nextStatus: 'CONFIRMED' },
    'CONTRACT_SIGNED': { label: 'Xác nhận xe sẵn sàng', icon: <Truck size={16}/>, nextStatus: 'VEHICLE_READY' },
    'WAITING_VEHICLE': { label: 'Xác nhận xe sẵn sàng', icon: <Truck size={16}/>, nextStatus: 'VEHICLE_READY' },
    'PREPARING_DELIVERY': { label: 'Bàn giao xe', icon: <Truck size={16}/>, nextStatus: 'DELIVERED' },
    'DELIVERED': { label: 'Hoàn thành đơn', icon: <CheckCircle2 size={16}/>, nextStatus: 'COMPLETED' },
  }

  const nextAction = order.status === 'PENDING_CONFIRMATION' && order.payment !== 'Paid'
    ? undefined
    : nextActionMap[order.status]

  const handleUpdateStatus = async (newStatus: string) => {
    setIsUpdating(true)
    let res: { success: boolean; error?: string } = { success: false }

    if (newStatus === 'VEHICLE_READY') {
      res = await notifyVehicleReadyForDelivery(order.id)
    } else if (newStatus === 'PENDING_CONTRACT') {
      try {
        const response = await fetch(`/api/v1/deposit-orders/${order.id}/contract/issue`, {
          method: 'POST',
        })
        const json = await response.json()
        if (response.ok && json.data) {
          res = { success: true }
        } else {
          res = { success: false, error: json.error?.message || json.error || 'Khởi tạo hợp đồng thất bại' }
        }
      } catch (err: any) {
        res = { success: false, error: err.message || 'Lỗi mạng khi khởi tạo hợp đồng' }
      }
    } else {
      res = await updateOrderStatus(order.id, newStatus)
    }

    setIsUpdating(false)
    if (res.success) {
      onShowToast({
        title: 'Thành công',
        message: newStatus === 'PENDING_CONTRACT'
          ? `${isMotorbike ? 'Đã phát hành thỏa thuận đặt mua' : 'Đã phát hành hợp đồng'} (thời hạn 72h) thành công`
          : newStatus === 'VEHICLE_READY'
            ? 'Đã xác nhận xe sẵn sàng và chuyển sang chuẩn bị bàn giao.'
            : 'Cập nhật trạng thái đơn hàng thành công',
        kind: 'success',
      })
      onOrderUpdated()
      if (newStatus === 'CANCELLED' || newStatus === 'COMPLETED') {
        onClose()
      }
    } else {
      onShowToast({ title: 'Lỗi', message: res.error || 'Có lỗi xảy ra khi cập nhật', kind: 'error' })
    }
  }

  const handleDebugAction = async (action: DepositDebugAction) => {
    setIsUpdating(true)
    const res = await runDepositDebugAction(order.id, action)
    setIsUpdating(false)
    if (res.success) {
      onShowToast({ title: 'Đã chạy thao tác debug', message: 'Trạng thái được cập nhật qua command nghiệp vụ tương thích.', kind: 'success' })
      onOrderUpdated()
    } else {
      onShowToast({ title: 'Lỗi', message: res.error || 'Có lỗi xảy ra', kind: 'error' })
    }
  }

  const handleConfirmRefund = async () => {
    setIsUpdating(true)
    const res = await confirmDepositRefund(order.id)
    setIsUpdating(false)
    if (res.success) {
      const refundCompleted = 'refundStatus' in res && res.refundStatus === 'COMPLETED'
      onShowToast({
        title: refundCompleted ? 'Hoàn tiền thành công' : 'VNPay đang xử lý hoàn tiền',
        message: refundCompleted
          ? 'Khoản tiền đặt cọc đã được xác nhận hoàn thành.'
          : 'Yêu cầu đã được gửi đến VNPay và đang chờ kết quả.',
        kind: 'success',
      })
      onOrderUpdated()
    } else {
      onShowToast({ title: 'Không thể xác nhận hoàn tiền', message: res.error || 'Vui lòng thử lại.', kind: 'error' })
    }
  }

  const requestConfirmRefund = () => {
    let toastId = 0
    toastId = onShowToast({
      title: 'Hoàn tiền qua VNPay?',
      message: `Hoàn toàn bộ ${formatMoney(order.amount)} cho đơn ${order.orderNumber}. Thao tác có thể không thể thu hồi.`,
      kind: 'warning',
      secondaryAction: { label: 'Để sau', onClick: () => onDismissToast(toastId) },
      action: {
        label: 'Gửi yêu cầu hoàn tiền',
        variant: 'danger',
        onClick: () => {
          onDismissToast(toastId)
          void handleConfirmRefund()
        },
      },
    }, 0)
  }

  const handleSyncKyc = async () => {
    setIsUpdating(true)
    try {
      const res = await syncKycStatus(order.id)
      if (res.success) {
        onShowToast({ kind: 'success', title: 'Thành công', message: res.message || 'Đã đồng bộ KYC' })
        onOrderUpdated()
      } else {
        onShowToast({ kind: 'error', title: 'Thất bại', message: res.error || 'Lỗi đồng bộ KYC' })
      }
    } catch (error: any) {
      onShowToast({ kind: 'error', title: 'Lỗi', message: error.message || 'Đã xảy ra lỗi hệ thống' })
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 w-full max-w-md bg-slate-50 shadow-2xl z-50 flex flex-col border-l border-slate-200"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Chi tiết Đơn hàng</h2>
                <p className="text-sm text-slate-500 font-medium">{order.orderNumber}</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Customer Info */}
              <section className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                    <User size={18} />
                  </div>
                  <h3 className="font-semibold text-slate-800">Thông tin Khách hàng</h3>
                  {order.kyc_status === 'APPROVED' ? (
                    <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                      <CheckCircle2 size={12} /> KYC
                    </span>
                  ) : order.kyc_status === 'REVIEW' ? (
                    <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-full">
                      ⚠️ Cần duyệt KYC
                    </span>
                  ) : order.kyc_status === 'DECLINED' ? (
                    <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-semibold rounded-full">
                      <XCircle size={12} /> KYC Thất bại
                    </span>
                  ) : null}
                </div>
                {order.kyc_status === 'REVIEW' && order.kyc_session_id && (
                  <div className="mb-4 flex flex-col gap-2">
                    <a 
                      href={`https://business.didit.me/sessions/${order.kyc_session_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="block w-full text-center py-2 px-4 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-lg text-sm font-semibold hover:bg-yellow-100 transition-colors"
                    >
                      Duyệt KYC trên Didit ↗
                    </a>
                    <button
                      onClick={handleSyncKyc}
                      disabled={isUpdating}
                      className="w-full text-center py-2 px-4 bg-white text-slate-700 border border-slate-300 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                      {isUpdating ? 'Đang đồng bộ...' : 'Đồng bộ kết quả từ Didit'}
                    </button>
                  </div>
                )}
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Loại khách:</span>
                    <span className="font-medium text-slate-900">{d.customer_type === 'personal' ? 'Cá nhân' : 'Doanh nghiệp'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Họ tên:</span>
                    <span className="font-medium text-slate-900">{d.full_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">SĐT:</span>
                    <span className="font-medium text-slate-900">{d.phone_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Email:</span>
                    <span className="font-medium text-slate-900">{d.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">CMND/CCCD:</span>
                    <span className="font-medium text-slate-900">{d.id_card_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Địa chỉ:</span>
                    <span className="font-medium text-slate-900 text-right max-w-[200px]">{d.ward}, {d.province}</span>
                  </div>
                </div>
              </section>

              {/* Vehicle & Deposit Info */}
              <section className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                    <FileText size={18} />
                  </div>
                  <h3 className="font-semibold text-slate-800">Thông tin Xe & Đặt cọc</h3>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Sản phẩm:</span>
                    <span className="font-medium text-slate-900 text-right max-w-[200px]">{order.vehicle}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Màu ngoại thất:</span>
                    <span className="font-medium text-slate-900">{d.exterior_color || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Màu nội thất:</span>
                    <span className="font-medium text-slate-900">{d.interior_color || '-'}</span>
                  </div>
                  <div className="pt-3 mt-3 border-t border-slate-100 flex justify-between">
                    <span className="text-slate-500">Tiền đặt cọc:</span>
                    <span className="font-bold text-brand-600">{formatMoney(order.amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tổng giá trị:</span>
                    <span className="font-bold text-slate-900">{formatMoney(Number(d.total_estimated_price || 0))}</span>
                  </div>
                  {Number(d.discount_amount || 0) > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Giá trước ưu đãi:</span>
                        <span className="font-medium text-slate-700">{formatMoney(Number(d.subtotal || 0))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Mã ưu đãi:</span>
                        <span className="font-semibold text-emerald-700">{d.promotion_code || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Số tiền giảm:</span>
                        <span className="font-bold text-emerald-700">-{formatMoney(Number(d.discount_amount))}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-500">Phương thức TT cọc:</span>
                    <span className="font-medium text-slate-900">
                      {d.payment_method === 'bank_transfer' ? 'Chuyển khoản ngân hàng' : 
                       d.payment_method === 'credit_card' ? 'Thẻ tín dụng/Ghi nợ' : 
                       d.payment_method === 'cash' ? 'Tiền mặt' : 
                       d.payment_method === 'installment' ? 'Trả góp' : d.payment_method}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Trạng thái TT cọc:</span>
                    <span className={`font-semibold ${order.status === 'CANCELLED' && order.payment === 'Paid' ? 'text-orange-600' : order.payment === 'Paid' ? 'text-green-600' : 'text-slate-600'}`}>
                      {order.status === 'CANCELLED' && order.refundStatus === 'COMPLETED'
                        ? 'Đã hủy, đã hoàn tiền'
                        : order.status === 'CANCELLED' && order.payment === 'Paid'
                        ? 'Đã hủy, chờ admin xác nhận hoàn tiền'
                        : order.payment === 'Paid' ? 'Đã đặt cọc' : 'Chờ đặt cọc'}
                    </span>
                  </div>
                </div>
              </section>

              {/* Delivery Info */}
              <section className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                    <MapPin size={18} />
                  </div>
                  <h3 className="font-semibold text-slate-800">Thông tin Nhận xe</h3>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex flex-col gap-1">
                    <span className="text-slate-500">Showroom:</span>
                    <span className="font-medium text-slate-900 leading-relaxed">{d.showroom || 'Chưa chọn'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Ngày tạo đơn:</span>
                    <span className="font-medium text-slate-900">{formatDate(d.created_at)}</span>
                  </div>
                </div>
              </section>

            </div>

            {/* Footer Actions */}
            <div className="p-4 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
              <div className="flex flex-col gap-3">
                {order.status === 'CANCELLED' && order.payment === 'Paid' && isRefundProcessing && (
                  <div className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
                    <RotateCcw size={16} className="animate-spin" />
                    Đang tự động kiểm tra hoàn tiền
                  </div>
                )}
                {order.status === 'CANCELLED' && order.payment === 'Paid' && order.refundStatus === 'PENDING' && !isRefundProcessing && (
                  <button
                    onClick={requestConfirmRefund}
                    disabled={isUpdating}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    <RotateCcw size={16} />
                    {isUpdating ? 'Đang gửi VNPay...' : order.refundAttemptStatus === 'FAILED' ? 'Thử hoàn tiền lại' : 'Xác nhận hoàn tiền'}
                  </button>
                )}
                {nextAction && order.status !== 'CANCELLED' && order.status !== 'COMPLETED' && (
                  <button
                    onClick={() => handleUpdateStatus(nextAction.nextStatus)}
                    disabled={isUpdating}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-lg transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {nextAction.icon}
                    {isUpdating ? 'Đang xử lý...' : nextAction.label}
                  </button>
                )}

                {!nextAction && order.status === 'CONFIRMED' && order.kyc_status !== 'APPROVED' && (
                  <div className="w-full flex flex-col items-center justify-center gap-2 py-3 px-4 text-sm text-slate-500 font-medium bg-slate-50 rounded-lg border border-slate-200">
                    <span>Đang chờ khách hàng xác minh KYC; hợp đồng sẽ tự phát hành khi đủ điều kiện.</span>
                    {debugActionsEnabled && (
                      <button
                        onClick={() => handleDebugAction('mock_kyc_approved')}
                        disabled={isUpdating}
                        className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-md text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        (Debug) Duyệt KYC
                      </button>
                    )}
                  </div>
                )}
                {!nextAction && order.status === 'CONFIRMED' && order.kyc_status === 'APPROVED' && (
                  <button
                    onClick={() => handleUpdateStatus('PENDING_CONTRACT')}
                    disabled={isUpdating}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-lg transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    <FileText size={16}/>
                    {isUpdating
                      ? 'Đang thử phát hành...'
                      : isMotorbike ? 'Thử phát hành lại thỏa thuận đặt mua' : 'Thử phát hành lại hợp đồng'}
                  </button>
                )}

                {!nextAction && order.status === 'PENDING_CONTRACT' && !hasIssuedDocumentProjection && (
                  <button
                    onClick={() => handleUpdateStatus('PENDING_CONTRACT')}
                    disabled={isUpdating}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    <FileText size={16}/>
                    {isUpdating
                      ? 'Đang sửa hàng đợi phát hành...'
                      : isMotorbike ? 'Sửa và phát hành thỏa thuận' : 'Sửa và phát hành hợp đồng'}
                  </button>
                )}

                {!nextAction && ['PENDING_DEPOSIT', 'PENDING_CONFIRMATION'].includes(order.status) && order.payment !== 'Paid' && (
                  <div className="w-full flex flex-col items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 py-3 px-4 text-sm font-medium text-amber-700">
                    <span>Đang chờ khách hàng thanh toán qua VNPAY</span>
                    {debugActionsEnabled && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDebugAction('mock_deposit_paid')}
                          disabled={isUpdating}
                          className="px-3 py-1.5 bg-amber-200 hover:bg-amber-300 text-amber-800 rounded-md text-xs font-semibold transition-colors disabled:opacity-50"
                        >
                          (Debug) Xác nhận cọc
                        </button>
                        <button
                          onClick={() => handleDebugAction('mock_confirm_order')}
                          disabled={isUpdating}
                          className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-md text-xs font-semibold transition-colors disabled:opacity-50"
                        >
                          (Debug) Test: Đã xét duyệt
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {!['CANCELLED', 'CONTRACT_SIGNED', 'WAITING_VEHICLE', 'PREPARING_DELIVERY', 'DELIVERED', 'COMPLETED'].includes(order.status) && (
                  <button
                    onClick={() => handleUpdateStatus('CANCELLED')}
                    disabled={isUpdating}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-white hover:bg-red-50 text-red-600 border border-red-200 font-medium rounded-lg transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    <XCircle size={16} />
                    Hủy đơn hàng
                  </button>
                )}
                {['CONTRACT_SIGNED', 'WAITING_VEHICLE', 'PREPARING_DELIVERY', 'DELIVERED', 'COMPLETED'].includes(order.status) && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-center text-xs font-medium text-slate-500">
                    {['CONTRACT_SIGNED', 'WAITING_VEHICLE'].includes(order.status)
                      ? 'Đơn đã ký và đang trong quy trình chuẩn bị giao xe; không thể hủy cọc trực tiếp.'
                      : 'Không thể hủy trực tiếp ở giai đoạn này.'}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
