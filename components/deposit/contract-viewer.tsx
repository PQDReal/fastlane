'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { contractStageCopy, getDepositContractMode, type DepositContractMode } from '@/lib/deposit/contract-workflow'

export type ContractViewerProps = {
  order: any
  onSign?: (otp: string) => Promise<void>
  onSendOtp?: () => Promise<void>
  canSign?: boolean
}

const formatMoney = (value: number) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value)
}

const formatDateStr = (isoString?: string) => {
  if (!isoString) return '[●]'
  const d = new Date(isoString)
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`
}

export function ContractViewer({ order, onSign, onSendOtp, canSign = false }: ContractViewerProps) {
  const [agreed, setAgreed] = useState(false)
  const [isSigning, setIsSigning] = useState(false)
  const [isOtpStep, setIsOtpStep] = useState(false)
  const [isSendingOtp, setIsSendingOtp] = useState(false)

  const handleSign = async () => {
    if (!agreed || !canSign || !onSign || !onSendOtp) return
    setIsSendingOtp(true)
    try {
      await onSendOtp()
      setIsOtpStep(true)
    } finally {
      setIsSendingOtp(false)
    }
  }

  const handleVerifyAndSign = async (otp: string) => {
    if (!canSign || !onSign || otp.length !== 6) return
    setIsSigning(true)
    try {
      await onSign(otp)
      setIsOtpStep(false)
    } finally {
      setIsSigning(false)
    }
  }

  const snapshot = order?.contractSnapshot || {}
  const seller = snapshot.seller || {}
  const legal = snapshot.legal || {}
  const productName = snapshot.carModel || order?.vehicle_variants?.product_name || order?.car_model || '[●]'
  const variantName = snapshot.carVariant || order?.vehicle_variants?.variant_name || order?.car_variant || '[●]'
  const color = snapshot.carColor || order?.exterior_color || '[●]'
  const contractMode: DepositContractMode = order?.contractMode || getDepositContractMode(order)
  const copy = contractStageCopy(contractMode)
  const isMotorbikeTerms = contractMode === 'BIKE_PURCHASE_TERMS'
  const documentName = isMotorbikeTerms ? 'thỏa thuận đặt mua' : 'hợp đồng'
  
  // Default values assuming these are returned by Supabase
  const customerName = snapshot.customerName || order?.full_name || '[●]'
  const customerIdCard = snapshot.customerIdCard || order?.id_card_number || '[●]'
  const customerPhone = snapshot.customerPhone || order?.phone_number || '[●]'
  const customerEmail = snapshot.customerEmail || order?.email || '[●]'
  
  // Calculate prices
  let totalPrice = 0
  let depositAmount = 0

  if (snapshot.totalPrice != null) {
    totalPrice = Number(snapshot.totalPrice)
  } else if (order?.total_estimated_price) {
    totalPrice = Number(order.total_estimated_price)
  }

  if (snapshot.depositAmount != null) {
    depositAmount = Number(snapshot.depositAmount)
  } else if (order?.deposit_amount) {
    depositAmount = Number(order.deposit_amount)
  } else if (order?.vehicle_variants?.deposit_amount) {
    depositAmount = Number(order.vehicle_variants.deposit_amount)
  }

  const remainingBalance = Math.max(0, totalPrice - depositAmount)
  const subtotal = Number(snapshot.subtotal ?? order?.subtotal ?? totalPrice)
  const discountAmount = Number(snapshot.discountAmount ?? order?.discount_amount ?? 0)
  
  // Use province and ward from deposit order
  let address = '[●]'
  if (snapshot.province || snapshot.ward || order?.province || order?.ward) {
    address = [snapshot.ward || order?.ward, snapshot.province || order?.province].filter(Boolean).join(', ')
  }

  const contractDate = formatDateStr(snapshot.createdAt || order?.created_at)
  const showroom = snapshot.showroom || order?.showroom || 'Showroom VinFast'

  const isSigned = order?.contractDocumentStatus === 'SIGNED'
    || order?.status === 'CONTRACT_SIGNED'
    || Boolean(order?.contract_signed_at)
  const signedAt = order?.contractDocumentSignedAt || order?.contract_signed_at
  const dueDateStr = order?.contract_signature_due_at
    ? new Date(order.contract_signature_due_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ngày ' + new Date(order.contract_signature_due_at).toLocaleDateString('vi-VN')
    : null

  return (
    <div className="mx-auto max-w-4xl bg-white p-6 shadow-sm sm:p-10 md:border md:border-slate-200 text-slate-800" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
      {/* DEADLINE BANNER */}
      {!isSigned && dueDateStr && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-center font-sans">
          <p className="text-sm font-semibold text-amber-800">
            ⏳ {isMotorbikeTerms ? 'Thỏa thuận đặt mua' : 'Hợp đồng'} đã được phát hành. Vui lòng xem và {isMotorbikeTerms ? 'xác nhận' : 'ký'} {documentName} trước <span className="underline">{dueDateStr}</span> (trong vòng 72 giờ).
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Trường hợp quá thời hạn 72 giờ chưa xác nhận, đơn đặt cọc sẽ tự động hủy và chuyển sang xử lý hoàn tiền. Bạn cũng có thể chủ động hủy đơn trong thời gian này.
          </p>
        </div>
      )}

      {/* SIGNED BANNER */}
      {isSigned && (
        <div className="mb-6 rounded-lg border border-green-300 bg-green-50 p-4 text-center font-sans">
          <p className="text-sm font-bold text-green-800">
            ✅ {isMotorbikeTerms ? 'Thỏa thuận đã được xác nhận' : 'Hợp đồng đã được ký'} điện tử thành công ngày {formatDateStr(signedAt)}.
          </p>
          <p className="mt-1 text-xs text-green-700">
            Chức năng tự hủy cọc hiện đã được khóa. Nếu cần dừng giao dịch, vui lòng liên hệ FastLane để được hỗ trợ.
          </p>
        </div>
      )}

      {/* HEADER */}
      <div className="text-center">
        <h1 className="text-xl font-bold uppercase sm:text-2xl">{snapshot.title || copy.title}</h1>
        <p className="mt-2 text-sm italic">Số: {snapshot.contractNumber || `${order?.order_number || order?.id?.substring(0, 8) || '[●]'}/${isMotorbikeTerms ? 'TĐM' : 'HĐMB'}`}</p>
      </div>

      <div className="mt-8 space-y-4 text-[15px] leading-relaxed text-slate-800">
        <p>{legal.introduction || `${isMotorbikeTerms ? 'Thỏa thuận' : 'Hợp đồng'} này được xác nhận giữa các bên dưới đây:`} <strong>{contractDate}</strong></p>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* BÊN BÁN */}
          <div>
            <h2 className="font-bold uppercase">BÊN BÁN: {seller.legalName || 'CÔNG TY TNHH KINH DOANH THƯƠNG MẠI VÀ DỊCH VỤ VINFAST'}</h2>
            <ul className="mt-2 space-y-1">
              <li>Địa chỉ: {seller.address || 'KCN Đình Vũ, Cát Hải, Hải Phòng, Việt Nam'}</li>
              <li>MSDN: {seller.businessRegistrationNumber || '0108926276'}</li>
              <li>Đại diện: {seller.representative || 'Theo ủy quyền'} - Chức vụ: {seller.representativeTitle || 'Giám đốc Kinh doanh'}</li>
            </ul>
          </div>

          {/* KHÁCH HÀNG */}
          <div>
            <h2 className="font-bold uppercase">KHÁCH HÀNG: {customerName}</h2>
            <ul className="mt-2 space-y-1">
              <li>Địa chỉ: {address}</li>
              <li>Điện thoại: {customerPhone} - Email: {customerEmail}</li>
              <li>CCCD/MSDN: {customerIdCard}</li>
            </ul>
          </div>
        </div>

        {/* ĐIỀU 1 */}
        <div className="mt-6">
          <h2 className="font-bold">Điều 1. Thông tin xe và giá bán</h2>
          <div className="mt-3 overflow-x-auto rounded-md border border-slate-300">
            <table className="w-full text-left">
              <thead className="bg-slate-100 font-semibold text-slate-800">
                <tr>
                  <th className="border-b border-r border-slate-300 p-2 text-center w-12">TT</th>
                  <th className="border-b border-r border-slate-300 p-2">Mô tả xe</th>
                  <th className="border-b border-r border-slate-300 p-2 text-center">Số lượng</th>
                  <th className="border-b border-r border-slate-300 p-2 text-right">Thành tiền (VNĐ)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300 bg-white">
                <tr>
                  <td className="border-r border-slate-300 p-2 text-center align-top">1</td>
                  <td className="border-r border-slate-300 p-2 align-top">
                    <p className="font-semibold">Xe {productName}</p>
                    <p className="mt-1 text-xs text-slate-600">Phiên bản: {variantName} - Màu: {color}</p>
                    <p className="mt-1 text-xs text-slate-600">{legal.vehicleDescription || 'Xe mới 100%, theo tiêu chuẩn của Nhà sản xuất.'}</p>
                  </td>
                  <td className="border-r border-slate-300 p-2 text-center align-top">1</td>
                  <td className="p-2 text-right align-top font-medium">{formatMoney(totalPrice)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 italic">{legal.priceTaxNote || (isMotorbikeTerms
            ? 'Giá trị đặt mua áp dụng theo thông tin thương mại đã được xác nhận.'
            : 'Giá trị Hợp đồng áp dụng theo thông tin thương mại đã được xác nhận.')}</p>
          {(legal.discountNote || discountAmount > 0) && (
            <p className="mt-2">{legal.discountNote || `Giá trước ưu đãi: ${formatMoney(subtotal)}; giá trị giảm: ${formatMoney(discountAmount)}.`}</p>
          )}
        </div>

        {/* ĐIỀU 2 */}
        <div className="mt-6 space-y-2">
          <h2 className="font-bold">{legal.payment?.heading || 'Điều 2. Thanh toán và điều kiện áp dụng'}</h2>
          {(legal.payment?.paragraphsBeforeBullets || [
            `Khách Hàng đã thanh toán tiền đặt cọc ${formatMoney(depositAmount)}.`,
            `Khoản tiền còn lại cần thanh toán là ${formatMoney(remainingBalance)}.`,
          ]).map((paragraph: string) => <p key={paragraph}>{paragraph}</p>)}
          <ul className="list-disc pl-5">
            {(legal.payment?.bullets || []).map((bullet: string) => <li key={bullet}>{bullet}</li>)}
          </ul>
          {(legal.payment?.paragraphsAfterBullets || []).map((paragraph: string) => <p key={paragraph}>{paragraph}</p>)}
        </div>

        {/* ĐIỀU 3 & 4 & 5 */}
        <div className="mt-6 space-y-2">
          <h2 className="font-bold">{legal.delivery?.heading || 'Điều 3. Giao nhận xe'}</h2>
          {(legal.delivery?.paragraphs || [`Thời gian giao nhận xe dự kiến tại ${showroom}.`])
            .map((paragraph: string) => <p key={paragraph}>{paragraph}</p>)}

          <h2 className="font-bold mt-4">{legal.warranty?.heading || 'Điều 4. Bảo hành'}</h2>
          {(legal.warranty?.paragraphs || []).map((paragraph: string) => <p key={paragraph}>{paragraph}</p>)}

          <h2 className="font-bold mt-4">{legal.otherTerms?.heading || 'Điều 5. Điều khoản khác'}</h2>
          <div className="space-y-1">
            {(legal.otherTerms?.paragraphs || []).map((paragraph: string) => <p key={paragraph}>- {paragraph}</p>)}
          </div>
        </div>

        {/* CHỮ KÝ */}
        <div className="mt-12 mb-8">
          <div className="flex flex-col items-center justify-between gap-8 sm:flex-row sm:items-start sm:px-12">
            <div className="text-center">
              <p className="font-bold uppercase">Khách Hàng</p>
              <p className="mt-1 text-xs italic text-slate-500">(Ký điện tử bằng tài khoản định danh)</p>
              <div className="mt-12 text-sm font-semibold text-slate-800">{customerName}</div>
            </div>
            <div className="text-center">
              <p className="font-bold uppercase">Bên Bán</p>
              <p className="mt-1 text-xs italic text-slate-500">(Ký tên và đóng dấu)</p>
              <div className="mt-12 text-sm font-semibold text-slate-800">{seller.signatureName || 'CÔNG TY VINFAST'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Hành động xác nhận tài liệu */}
      {!isSigned && canSign ? (
        <div className="mt-8 flex flex-col items-center space-y-6 border-t border-slate-200 pt-8 sm:px-6 font-sans">
          <label className="flex cursor-pointer items-start space-x-3 rounded-lg border border-transparent p-3 transition-colors hover:bg-slate-50">
            <input
              type="checkbox"
              id="agree-contract"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 h-5 w-5 rounded border-gray-300 text-[#1e4d2b] focus:ring-[#1e4d2b]"
            />
            <div className="leading-snug">
              <p className="font-medium text-slate-900">{legal.consentText || copy.consent}</p>
              <p className="mt-1 text-xs text-slate-500">{legal.consentLegalNotice || 'Thao tác xác nhận được ghi nhận cùng bằng chứng điện tử của giao dịch.'}</p>
            </div>
          </label>

          <Button
            onClick={handleSign}
            disabled={!agreed || isSendingOtp || isSigning || !onSign || !onSendOtp}
            size="default"
            className="w-full sm:w-auto sm:px-16 bg-[#1e4d2b] hover:bg-[#1e4d2b]/90 text-white"
          >
            {isSendingOtp ? 'Đang gửi mã...' : contractMode === 'CAR_SALES' ? 'Ký hợp đồng' : 'Xác nhận thỏa thuận'}
          </Button>
        </div>
      ) : isSigned ? (
        <div className="mt-8 flex flex-col items-center border-t border-slate-200 pt-6 font-sans">
          <div className="text-center text-sm font-semibold text-green-700">
            ✓ Đã hoàn tất xác nhận điện tử. Bản ghi {documentName} đã được lưu trữ.
          </div>
        </div>
      ) : null}

      <OTPModal
        isOpen={isOtpStep}
        onClose={() => setIsOtpStep(false)}
        isVerifying={isSigning}
        onComplete={handleVerifyAndSign}
      />
    </div>
  )
}

function OTPModal({ 
  isOpen, 
  onClose, 
  onComplete, 
  isVerifying 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onComplete: (otp: string) => void, 
  isVerifying: boolean 
}) {
  const [otp, setOtp] = React.useState(['', '', '', '', '', ''])
  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([])

  React.useEffect(() => {
    if (isOpen) {
      setOtp(['', '', '', '', '', ''])
      setTimeout(() => inputRefs.current[0]?.focus(), 100)
    }
  }, [isOpen])

  const handleChange = (index: number, value: string) => {
    if (isVerifying) return
    const numericValue = value.replace(/\D/g, '')
    if (!numericValue && value !== '') return

    const newOtp = [...otp]
    
    // Allow pasting 6 digits
    if (numericValue.length > 1) {
      const chars = numericValue.slice(0, 6).split('')
      for (let i = 0; i < chars.length; i++) {
        newOtp[i] = chars[i]
      }
      setOtp(newOtp)
      
      const nextIndex = Math.min(chars.length, 5)
      inputRefs.current[nextIndex]?.focus()
      
      if (chars.length === 6) {
        onComplete(newOtp.join(''))
      }
      return
    }

    newOtp[index] = numericValue
    setOtp(newOtp)

    // Auto focus next
    if (numericValue && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }

    // Auto submit if all filled
    if (newOtp.every(v => v !== '') && (index === 5 || newOtp.join('').length === 6)) {
      onComplete(newOtp.join(''))
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isVerifying) return
    if (e.key === 'Backspace') {
      e.preventDefault()
      const newOtp = [...otp]
      if (otp[index]) {
        newOtp[index] = ''
        setOtp(newOtp)
      } else if (index > 0) {
        newOtp[index - 1] = ''
        setOtp(newOtp)
        inputRefs.current[index - 1]?.focus()
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl relative font-sans"
          >
            <button 
              onClick={onClose}
              className="absolute right-4 top-4 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              disabled={isVerifying}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
            
            <div className="mb-6 mt-2 text-center">
              <h2 className="text-xl font-bold text-slate-800">Xác thực hợp đồng</h2>
              <p className="mt-2 text-sm text-slate-500">Mã xác thực 6 số đã được gửi đến email của bạn.</p>
            </div>

            <div className="mb-8 flex justify-center gap-2 sm:gap-3" dir="ltr">
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={el => { inputRefs.current[index] = el }}
                  type="text"
                  inputMode="numeric"
                  pattern="\d*"
                  maxLength={6}
                  value={digit}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  disabled={isVerifying}
                  className="h-12 w-10 sm:h-14 sm:w-11 rounded-lg border-2 border-slate-200 bg-slate-50 text-center text-xl font-semibold text-slate-900 transition-all focus:border-[#1e4d2b] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1e4d2b]/20 disabled:opacity-50"
                />
              ))}
            </div>

            <div className="h-6 text-center">
              {isVerifying ? (
                <p className="flex items-center justify-center gap-2 text-sm font-medium text-[#1e4d2b]">
                  <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  Đang xác thực...
                </p>
              ) : (
                <p className="text-xs text-slate-400">
                  Sẽ tự động xác nhận khi nhập đủ 6 số
                </p>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
