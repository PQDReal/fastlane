'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, CheckCircle2, FileText, Truck, XCircle, CreditCard, User, MapPin } from 'lucide-react'
import { AdminOrderRow } from './orders-client'
import { confirmDepositRefund, updateOrderStatus } from './actions'
import { ToastMessage } from '@/components/ui/toast'

type OrderDetailDrawerProps = {
  order: AdminOrderRow | null
  isOpen: boolean
  onClose: () => void
  onOrderUpdated: () => void
  onShowToast: (toast: Omit<ToastMessage, 'id'>) => void
}

export function AdminOrderDetailDrawer({ order, isOpen, onClose, onOrderUpdated, onShowToast }: OrderDetailDrawerProps) {
  const [isUpdating, setIsUpdating] = useState(false)

  if (!order || !order.rawDeposit) return null

  const d = order.rawDeposit

  const formatMoney = (val: number) => new Intl.NumberFormat('vi-VN').format(val) + ' ₫'
  const formatDate = (dStr: string) => new Date(dStr).toLocaleDateString('vi-VN', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  })

  const nextActionMap: Record<string, { label: string; icon: any; nextStatus: string }> = {
    'PENDING_CONFIRMATION': { label: 'Xác nhận đơn & duyệt', icon: <CheckCircle2 size={16}/>, nextStatus: 'CONFIRMED' },
    'PENDING_CONTRACT': { label: 'Khách đã ký Hợp đồng', icon: <FileText size={16}/>, nextStatus: 'CONTRACT_SIGNED' },
    'CONTRACT_SIGNED': { label: 'Yêu cầu thanh toán xe', icon: <CreditCard size={16}/>, nextStatus: 'PENDING_PAYMENT' },
    'PAID': { label: 'Chuẩn bị giao xe', icon: <Truck size={16}/>, nextStatus: 'PREPARING_DELIVERY' },
    'PREPARING_DELIVERY': { label: 'Bàn giao xe', icon: <Truck size={16}/>, nextStatus: 'DELIVERED' },
    'DELIVERED': { label: 'Hoàn thành đơn', icon: <CheckCircle2 size={16}/>, nextStatus: 'COMPLETED' },
  }

  const nextAction = order.status === 'PENDING_CONFIRMATION' && order.payment !== 'Paid'
    ? undefined
    : nextActionMap[order.status]

  const handleUpdateStatus = async (newStatus: string) => {
    setIsUpdating(true)
    const res = await updateOrderStatus(order.id, newStatus)
    setIsUpdating(false)
    if (res.success) {
      onShowToast({ title: 'Thành công', message: 'Cập nhật trạng thái đơn hàng thành công', kind: 'success' })
      onOrderUpdated()
      if (newStatus === 'CANCELLED' || newStatus === 'COMPLETED') {
        onClose()
      }
    } else {
      onShowToast({ title: 'Lỗi', message: res.error || 'Có lỗi xảy ra khi cập nhật', kind: 'error' })
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
    onShowToast({
      title: 'Xác nhận hoàn tiền?',
      message: 'Hệ thống sẽ gửi yêu cầu hoàn tiền đặt cọc đến VNPay.',
      kind: 'warning',
      secondaryAction: { label: 'Kiểm tra lại', onClick: () => undefined },
      action: { label: 'Xác nhận hoàn tiền', onClick: () => void handleConfirmRefund() },
    })
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
                  <div className="mb-4">
                    <a 
                      href={`https://business.didit.me/sessions/${order.kyc_session_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="block w-full text-center py-2 px-4 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-lg text-sm font-semibold hover:bg-yellow-100 transition-colors"
                    >
                      Duyệt KYC trên Didit ↗
                    </a>
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

              {/* Vehicle & Payment Info */}
              <section className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                    <CreditCard size={18} />
                  </div>
                  <h3 className="font-semibold text-slate-800">Thông tin Xe & Thanh toán</h3>
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
                        ? 'Đã hủy, chờ hoàn tiền'
                        : order.payment === 'Paid' ? 'Đã Thanh Toán' : 'Chờ Thanh Toán'}
                    </span>
                  </div>
                  {order.status === 'PAID' && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Thanh toán đơn xe:</span>
                      <span className="font-semibold text-emerald-600">Đã thanh toán toàn bộ</span>
                    </div>
                  )}
                  <div className="pt-3 mt-3 border-t border-slate-100 flex justify-between bg-amber-50/50 p-2 rounded-lg">
                    <span className="text-amber-800 font-medium">Số tiền còn lại phải đóng:</span>
                    <span className="font-bold text-amber-700">
                      {formatMoney(order.status === 'PAID' ? 0 : Math.max(0, Number(d.total_estimated_price || 0) - order.amount))}
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
                {order.status === 'CANCELLED' && order.payment === 'Paid' && order.refundStatus !== 'COMPLETED' && (
                  <button
                    onClick={requestConfirmRefund}
                    disabled={isUpdating}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    <CheckCircle2 size={16} />
                    {isUpdating ? 'Đang gửi VNPay...' : 'Xác nhận hoàn tiền'}
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

                {!nextAction && order.status === 'CONFIRMED' && (
                  <div className="w-full text-center py-2.5 text-sm text-slate-500 font-medium bg-slate-50 rounded-lg border border-slate-200">
                    Đang chờ khách hàng xác minh KYC
                  </div>
                )}

                {!nextAction && ['PENDING_DEPOSIT', 'PENDING_CONFIRMATION'].includes(order.status) && order.payment !== 'Paid' && (
                  <div className="w-full rounded-lg border border-amber-200 bg-amber-50 py-2.5 text-center text-sm font-medium text-amber-700">
                    Đang chờ khách hàng thanh toán qua VNPAY
                  </div>
                )}

                {!nextAction && order.status === 'PENDING_PAYMENT' && (
                  <div className="w-full rounded-lg border border-amber-200 bg-amber-50 py-2.5 text-center text-sm font-medium text-amber-700">
                    Đang chờ khách hàng thanh toán phần còn lại qua VNPAY
                  </div>
                )}

                
                {!['CANCELLED', 'PAID', 'PREPARING_DELIVERY', 'DELIVERED', 'COMPLETED'].includes(order.status) && (
                  <button
                    onClick={() => handleUpdateStatus('CANCELLED')}
                    disabled={isUpdating}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-white hover:bg-red-50 text-red-600 border border-red-200 font-medium rounded-lg transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    <XCircle size={16} />
                    Hủy đơn hàng
                  </button>
                )}
                {['PAID', 'PREPARING_DELIVERY', 'DELIVERED', 'COMPLETED'].includes(order.status) && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-center text-xs font-medium text-slate-500">
                    Không thể hủy trực tiếp ở giai đoạn này.
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
