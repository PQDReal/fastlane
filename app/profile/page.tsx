'use client'

import { FormEvent, Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useUser } from '@auth0/nextjs-auth0/client'
import { CheckCircle2, Clock, Loader2, Package, User, XCircle, CarFront } from 'lucide-react'

import { Footer } from '@/components/footer'
import { Header } from '@/components/header'
import { PopupLoginButton } from '@/components/auth/popup-login-button'
import { ToastViewport, type ToastMessage } from '@/components/ui/toast'
import { getMyProfile, updateMyProfile, type CustomerProfile } from '@/lib/api/profile-client'
import type { AccessoryOrderSummary } from '@/lib/cart/types'

function ProfileContent() {
  const { user, isLoading } = useUser()
  const searchParams = useSearchParams()
  const validTabs = ['info', 'orders', 'car-orders']
  const tabParam = searchParams?.get('tab')
  const initialTab = validTabs.includes(tabParam || '') ? tabParam : 'info'
  const [activeTab, setActiveTab] = useState<'info' | 'orders' | 'car-orders'>(initialTab as any)
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [fullName, setFullName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [profileLoading, setProfileLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [userOrders, setUserOrders] = useState<AccessoryOrderSummary[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState<string | null>(null)

  function showToast(kind: ToastMessage['kind'], title: string, message?: string) {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { id, kind, title, message }])
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4500)
  }

  useEffect(() => {
    if (!user) return

    let active = true
    setProfileLoading(true)
    getMyProfile()
      .then((data) => {
        if (!active) return
        setProfile(data)
        setFullName(data.fullName)
        setPhoneNumber(data.phoneNumber ?? '')
      })
      .catch((error: unknown) => {
        if (active) showToast('error', 'Kh\u00f4ng th\u1ec3 t\u1ea3i h\u1ed3 s\u01a1', 'Vui l\u00f2ng th\u1eed l\u1ea1i sau.')
      })
      .finally(() => {
        if (active) setProfileLoading(false)
      })

    return () => { active = false }
  }, [user])

  const normalizedProfileForm = {
    fullName: fullName.trim(),
    phoneNumber: phoneNumber.trim(),
  }
  const hasProfileChanges = Boolean(profile) && (
    normalizedProfileForm.fullName !== profile?.fullName.trim() ||
    normalizedProfileForm.phoneNumber !== (profile?.phoneNumber ?? '').trim()
  )
  const canUpdateProfile = Boolean(normalizedProfileForm.fullName && hasProfileChanges)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canUpdateProfile) return
    setSaving(true)

    try {
      const updated = await updateMyProfile({
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim() || null,
      })
      setProfile(updated)
      setFullName(updated.fullName)
      setPhoneNumber(updated.phoneNumber ?? '')
      showToast('success', 'C\u1eadp nh\u1eadt th\u00f4ng tin th\u00e0nh c\u00f4ng')
    } catch (error) {
      showToast('error', 'C\u1eadp nh\u1eadt th\u00f4ng tin th\u1ea5t b\u1ea1i', 'Vui l\u00f2ng ki\u1ec3m tra th\u00f4ng tin v\u00e0 th\u1eed l\u1ea1i.')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!user || (activeTab !== 'orders' && activeTab !== 'car-orders')) return

    let active = true
    setOrdersLoading(true)
    setOrdersError(null)
    const typeQuery = activeTab === 'orders' ? 'accessory' : 'car'
    fetch(`/api/v1/orders?limit=20&type=${typeQuery}`)
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload.error?.message || 'Không thể tải đơn hàng.')
        }
        if (active) setUserOrders(payload.data || [])
      })
      .catch((error: unknown) => {
        if (active) setOrdersError(error instanceof Error ? error.message : 'Không thể tải đơn hàng.')
      })
      .finally(() => {
        if (active) setOrdersLoading(false)
      })

    return () => {
      active = false
    }
  }, [activeTab, user])

  if (isLoading) {
    return <main className="flex min-h-screen items-center justify-center bg-gray-50"><Loader2 className="h-8 w-8 animate-spin text-[#836100]" /></main>
  }

  if (!user) {
    return (
      <main className="flex min-h-screen flex-col bg-gray-50">
        <Header />
        <div className="flex flex-1 flex-col items-center justify-center pb-20 pt-32 text-center">
          <h1 className="text-2xl font-bold">Vui lòng đăng nhập để xem hồ sơ</h1>
          <PopupLoginButton className="mt-4 inline-block rounded-full bg-[#836100] px-6 py-3 font-bold text-white transition-colors hover:bg-[#6a4e00]">Đăng nhập ngay</PopupLoginButton>
        </div>
        <Footer />
      </main>
    )
  }

  const displayName = profile?.fullName || user.name || 'Tài khoản'
  const formatPrice = (price: number | string) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(price))
  const formatDate = (date: string) => new Date(date).toLocaleDateString('vi-VN')
  const statusIcon = (status: string) => status === 'Completed'
    ? <CheckCircle2 className="h-5 w-5 text-green-500" />
    : status === 'Cancelled'
      ? <XCircle className="h-5 w-5 text-red-500" />
      : <Clock className="h-5 w-5 text-yellow-500" />

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <Header />
      <ToastViewport toasts={toasts} onClose={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
      <div className="mx-auto flex w-full max-w-[1000px] flex-1 px-6 py-32">
        <div className="flex w-full flex-col gap-8 md:flex-row">
          <aside className="w-full shrink-0 md:w-64">
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className="border-b border-gray-100 p-6 text-center">
                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gray-100">
                  {user.picture ? <img src={user.picture} alt={displayName} className="h-full w-full object-cover" /> : <User className="h-8 w-8 text-gray-400" />}
                </div>
                <h2 className="font-bold text-gray-900">{displayName}</h2>
                <p className="mt-1 truncate text-xs text-gray-500">{profile?.email || user.email}</p>
              </div>
              <div className="p-2">
                <button onClick={() => setActiveTab('info')} className={`w-full rounded-xl px-4 py-3 text-left text-sm font-medium transition-colors ${activeTab === 'info' ? 'bg-[#836100]/10 text-[#836100]' : 'text-gray-600 hover:bg-gray-50'}`}><User className="mr-3 inline-block h-4 w-4" />Hồ sơ của tôi</button>
                <button onClick={() => setActiveTab('orders')} className={`w-full rounded-xl px-4 py-3 text-left text-sm font-medium transition-colors ${activeTab === 'orders' ? 'bg-[#836100]/10 text-[#836100]' : 'text-gray-600 hover:bg-gray-50'}`}><Package className="mr-3 inline-block h-4 w-4" />Lịch sử mua hàng</button>
                <button onClick={() => setActiveTab('car-orders')} className={`w-full rounded-xl px-4 py-3 text-left text-sm font-medium transition-colors ${activeTab === 'car-orders' ? 'bg-[#836100]/10 text-[#836100]' : 'text-gray-600 hover:bg-gray-50'}`}><CarFront className="mr-3 inline-block h-4 w-4" />Lịch sử đặt xe</button>
              </div>
            </div>
          </aside>

          <section className="flex-1 rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
            {activeTab === 'info' ? (
              <div>
                <h2 className="mb-6 text-2xl font-bold text-gray-900">Hồ sơ cá nhân</h2>
                {profileLoading ? (
                  <div className="flex h-48 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#836100]" /></div>
                ) : (
                  <form onSubmit={handleSubmit} className="max-w-md space-y-6">
                    <div>
                      <label htmlFor="profile-full-name" className="mb-2 block text-sm font-medium text-gray-700">Họ và tên</label>
                      <input id="profile-full-name" value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={120} required className="w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-900 focus:border-[#836100] focus:outline-none" />
                    </div>
                    <div>
                      <label htmlFor="profile-phone" className="mb-2 block text-sm font-medium text-gray-700">Số điện thoại</label>
                      <input id="profile-phone" type="tel" inputMode="tel" autoComplete="tel" aria-describedby="profile-phone-hint" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="0901234567 hoặc +84901234567" className="w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-900 focus:border-[#836100] focus:outline-none" />
                      <p id="profile-phone-hint" className="mt-2 text-xs leading-5 text-gray-500">Số điện thoại gồm 9–15 chữ số, có thể bắt đầu bằng dấu +.</p>
                    </div>
                    <div>
                      <label htmlFor="profile-email" className="mb-2 block text-sm font-medium text-gray-700">Email</label>
                      <input id="profile-email" type="email" disabled value={profile?.email || user.email || ''} className="w-full cursor-not-allowed rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-500" />
                      <p className="mt-2 text-xs text-gray-500">Không thể thay đổi Email.</p>
                    </div>
                    <button type="submit" disabled={saving || !canUpdateProfile} className="flex items-center gap-2 rounded-full bg-[#836100] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-[#6a4e00] disabled:cursor-not-allowed disabled:opacity-60">
                      {saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? 'Đang cập nhật...' : 'Cập nhật thông tin'}
                    </button>
                  </form>
                )}
              </div>
            ) : (
              <div>
                <h2 className="mb-6 text-2xl font-bold text-gray-900">
                  {activeTab === 'orders' ? 'Lịch sử mua hàng' : 'Lịch sử đặt xe'}
                </h2>
                <div className="space-y-4">
                  {ordersLoading && (
                    <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-[#836100]" /></div>
                  )}
                  {ordersError && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{ordersError}</p>}
                  {!ordersLoading && !ordersError && userOrders.length === 0 && (
                    <p className="rounded-xl bg-gray-50 p-8 text-center text-sm text-gray-500">Bạn chưa có đơn hàng nào.</p>
                  )}
                  {userOrders.map(order => (
                    <div key={order.id} className="border border-gray-100 rounded-xl p-5 hover:border-[#836100]/30 transition-colors">
                      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-50 pb-4 mb-4">
                        <div>
                          <p className="text-sm font-bold text-gray-900">{order.orderNumber}</p>
                          <p className="text-xs text-gray-500 mt-1">Ngày đặt: {formatDate(order.createdAt)}</p>
                         </div>
                         <div className="flex items-center gap-2">
                           {statusIcon(order.status)}
                          <span className="text-sm font-medium text-gray-700">{order.status}</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-12 bg-gray-100 rounded-lg flex items-center justify-center">
                            {order.orderType === 'deposit' ? (
                              <CarFront className="h-6 w-6 text-gray-400" />
                            ) : (
                              <Package className="h-6 w-6 text-gray-400" />
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">
                              {order.orderType === 'deposit' 
                                ? `Đơn đặt cọc xe ${order.carModel || ''} ${order.carVariant || ''}`.trim()
                                : 'Đơn phụ kiện FASTLANE'}
                            </p>
                            <p className="text-sm text-gray-500">Thanh toán: {order.paymentStatus}</p>
                          </div>
                        </div>
                         <p className="font-bold text-[#836100]">{formatPrice(order.pricing.grandTotal)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
      <Footer />
    </main>
  )
}

export default function ProfilePage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-gray-50"><Loader2 className="h-8 w-8 animate-spin text-[#836100]" /></main>}><ProfileContent /></Suspense>
}
