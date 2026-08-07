'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { ContractViewer } from '@/components/deposit/contract-viewer'
import { ToastViewport, type ToastMessage } from '@/components/ui/toast'

export default function ContractPageClient({ order }: { order: any }) {
  const router = useRouter()
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  
  function showToast(
    kind: ToastMessage['kind'],
    title: string,
    message?: string
  ) {
    const id = Date.now() + Math.random()
    const dismiss = () => setToasts((current) => current.filter((toast) => toast.id !== id))
    setToasts((current) => [...current, { id, kind, title, message }])
    window.setTimeout(dismiss, 4500)
  }

  const handleSendOtp = async () => {
    try {
      const res = await fetch('/api/contracts/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lỗi khi gửi mã OTP')
      
      showToast('success', 'Đã gửi mã OTP', 'Vui lòng kiểm tra email của bạn.')
    } catch (err: any) {
      showToast('error', 'Lỗi', err.message || 'Không thể gửi mã OTP lúc này')
      throw err // Ném lỗi để ContractViewer xử lý (ví dụ bỏ loading state)
    }
  }
  
  const handleSign = async (otp: string) => {
    try {
      const res = await fetch('/api/contracts/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, otp }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lỗi khi ký hợp đồng')
      
      showToast('success', 'Ký hợp đồng thành công', 'Đơn hàng của bạn đã được cập nhật trạng thái.')
      
      setTimeout(() => {
        router.push(data.redirectUrl || '/profile?tab=car-orders')
        router.refresh()
      }, 1500)
    } catch (err: any) {
      showToast('error', 'Lỗi', err.message || 'Không thể ký hợp đồng lúc này')
      throw err // Để bên trong component ngừng isSigning
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <ToastViewport toasts={toasts} onClose={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
      <div className="mx-auto max-w-4xl mb-6 flex items-center">
        <button 
          onClick={() => router.back()} 
          className="flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Quay lại hồ sơ
        </button>
      </div>
      <ContractViewer order={order} onSign={handleSign} onSendOtp={handleSendOtp} />
    </div>
  )
}
