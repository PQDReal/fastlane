'use client'

import { useState, Suspense } from 'react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { useUser } from '@auth0/nextjs-auth0/client'
import { mockOrders } from '@/lib/mock-db'
import { useSearchParams } from 'next/navigation'
import { Package, User, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react'

function ProfileContent() {
  const { user, isLoading } = useUser()
  const searchParams = useSearchParams()
  const initialTab = searchParams?.get('tab') === 'orders' ? 'orders' : 'info'
  const [activeTab, setActiveTab] = useState<'info' | 'orders'>(initialTab)

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#836100]" />
      </main>
    )
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-gray-50 flex flex-col">
        <Header />
        <div className="flex-1 flex flex-col items-center justify-center pt-32 pb-20 text-center">
          <h1 className="text-2xl font-bold">Vui lòng đăng nhập để xem hồ sơ</h1>
          <a href="/auth/login" className="mt-4 inline-block rounded-full bg-[#836100] px-6 py-3 text-white font-bold hover:bg-[#6a4e00] transition-colors">Đăng nhập ngay</a>
        </div>
        <Footer />
      </main>
    )
  }

  const userOrders = mockOrders.slice(0, 5)

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Completed': return <CheckCircle2 className="h-5 w-5 text-green-500" />
      case 'Cancelled': return <XCircle className="h-5 w-5 text-red-500" />
      default: return <Clock className="h-5 w-5 text-yellow-500" />
    }
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('vi-VN')
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      
      <div className="flex-1 max-w-[1000px] w-full mx-auto px-6 py-32">
        <div className="flex flex-col md:flex-row gap-8">
          
          <div className="w-full md:w-64 shrink-0">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 text-center border-b border-gray-100">
                <div className="h-20 w-20 mx-auto rounded-full bg-gray-100 flex items-center justify-center mb-4 overflow-hidden">
                  {user.picture ? (
                    <img src={user.picture} alt={user.name || ''} className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-8 w-8 text-gray-400" />
                  )}
                </div>
                <h2 className="font-bold text-gray-900">{user.name || 'Tài khoản'}</h2>
                <p className="text-xs text-gray-500 mt-1 truncate">{user.email}</p>
              </div>
              <div className="p-2">
                <button
                  onClick={() => setActiveTab('info')}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-colors ${activeTab === 'info' ? 'bg-[#836100]/10 text-[#836100]' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  <User className="inline-block w-4 h-4 mr-3" />
                  Hồ sơ của tôi
                </button>
                <button
                  onClick={() => setActiveTab('orders')}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-colors ${activeTab === 'orders' ? 'bg-[#836100]/10 text-[#836100]' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  <Package className="inline-block w-4 h-4 mr-3" />
                  Lịch sử đơn hàng
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            {activeTab === 'info' ? (
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Hồ sơ cá nhân</h2>
                <div className="space-y-6 max-w-md">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Họ và tên</label>
                    <input 
                      type="text" 
                      disabled 
                      value={user.name || ''} 
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                    <input 
                      type="text" 
                      disabled 
                      value={user.email || ''} 
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-500 cursor-not-allowed"
                    />
                  </div>
                  <button className="px-6 py-3 bg-[#836100] text-white font-bold rounded-full text-sm hover:bg-[#6a4e00] transition-colors">
                    Cập nhật thông tin
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Lịch sử đơn hàng</h2>
                <div className="space-y-4">
                  {userOrders.map(order => (
                    <div key={order.id} className="border border-gray-100 rounded-xl p-5 hover:border-[#836100]/30 transition-colors">
                      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-50 pb-4 mb-4">
                        <div>
                          <p className="text-sm font-bold text-gray-900">{order.orderNumber}</p>
                          <p className="text-xs text-gray-500 mt-1">Ngày đặt: {formatDate(order.createdAt)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(order.status)}
                          <span className="text-sm font-medium text-gray-700">{order.status}</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-12 bg-gray-100 rounded-lg flex items-center justify-center">
                            <Package className="h-6 w-6 text-gray-400" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{order.vehicle}</p>
                            <p className="text-sm text-gray-500">Thanh toán: {order.payment}</p>
                          </div>
                        </div>
                        <p className="font-bold text-[#836100]">{formatPrice(order.amount)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <Footer />
    </main>
  )
}

export default function ProfilePage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#836100]" />
      </main>
    }>
      <ProfileContent />
    </Suspense>
  )
}
