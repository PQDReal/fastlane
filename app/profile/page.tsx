'use client'

import { FormEvent, Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useUser } from '@auth0/nextjs-auth0/client'
import { CheckCircle2, Clock, Loader2, Package, User, XCircle } from 'lucide-react'

import { Footer } from '@/components/footer'
import { Header } from '@/components/header'
import { getMyProfile, updateMyProfile, type CustomerProfile } from '@/lib/api/profile-client'
import { mockOrders } from '@/lib/mock-db'

function ProfileContent() {
  const { user, isLoading } = useUser()
  const searchParams = useSearchParams()
  const initialTab = searchParams?.get('tab') === 'orders' ? 'orders' : 'info'
  const [activeTab, setActiveTab] = useState<'info' | 'orders'>(initialTab)
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [fullName, setFullName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [profileLoading, setProfileLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

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
        if (active) setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Không thể tải hồ sơ' })
      })
      .finally(() => {
        if (active) setProfileLoading(false)
      })

    return () => { active = false }
  }, [user])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setMessage(null)

    try {
      const updated = await updateMyProfile({
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim() || null,
      })
      setProfile(updated)
      setFullName(updated.fullName)
      setPhoneNumber(updated.phoneNumber ?? '')
      setMessage({ type: 'success', text: 'Cập nhật thông tin thành công.' })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Không thể cập nhật hồ sơ' })
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return <main className="flex min-h-screen items-center justify-center bg-gray-50"><Loader2 className="h-8 w-8 animate-spin text-[#836100]" /></main>
  }

  if (!user) {
    return (
      <main className="flex min-h-screen flex-col bg-gray-50">
        <Header />
        <div className="flex flex-1 flex-col items-center justify-center pb-20 pt-32 text-center">
          <h1 className="text-2xl font-bold">Vui lòng đăng nhập để xem hồ sơ</h1>
          <a href="/auth/login" className="mt-4 inline-block rounded-full bg-[#836100] px-6 py-3 font-bold text-white transition-colors hover:bg-[#6a4e00]">Đăng nhập ngay</a>
        </div>
        <Footer />
      </main>
    )
  }

  const userOrders = mockOrders.slice(0, 5)
  const displayName = profile?.fullName || user.name || 'Tài khoản'
  const formatPrice = (price: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price)
  const formatDate = (date: string) => new Date(date).toLocaleDateString('vi-VN')
  const statusIcon = (status: string) => status === 'Completed'
    ? <CheckCircle2 className="h-5 w-5 text-green-500" />
    : status === 'Cancelled'
      ? <XCircle className="h-5 w-5 text-red-500" />
      : <Clock className="h-5 w-5 text-yellow-500" />

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <Header />
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
                <button onClick={() => setActiveTab('orders')} className={`w-full rounded-xl px-4 py-3 text-left text-sm font-medium transition-colors ${activeTab === 'orders' ? 'bg-[#836100]/10 text-[#836100]' : 'text-gray-600 hover:bg-gray-50'}`}><Package className="mr-3 inline-block h-4 w-4" />Lịch sử đơn hàng</button>
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
                      <input id="profile-phone" type="tel" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="0901234567" className="w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-900 focus:border-[#836100] focus:outline-none" />
                    </div>
                    <div>
                      <label htmlFor="profile-email" className="mb-2 block text-sm font-medium text-gray-700">Email</label>
                      <input id="profile-email" type="email" disabled value={profile?.email || user.email || ''} className="w-full cursor-not-allowed rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-500" />
                      <p className="mt-2 text-xs text-gray-500">Email đăng nhập được quản lý bởi Auth0.</p>
                    </div>
                    {message && <p role="status" className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>{message.text}</p>}
                    <button type="submit" disabled={saving || !fullName.trim()} className="flex items-center gap-2 rounded-full bg-[#836100] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-[#6a4e00] disabled:cursor-not-allowed disabled:opacity-60">
                      {saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? 'Đang cập nhật...' : 'Cập nhật thông tin'}
                    </button>
                  </form>
                )}
              </div>
            ) : (
              <div>
                <h2 className="mb-6 text-2xl font-bold text-gray-900">Lịch sử đơn hàng</h2>
                <div className="space-y-4">
                  {userOrders.map((order) => (
                    <div key={order.id} className="rounded-xl border border-gray-100 p-5 transition-colors hover:border-[#836100]/30">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-gray-50 pb-4">
                        <div><p className="text-sm font-bold text-gray-900">{order.orderNumber}</p><p className="mt-1 text-xs text-gray-500">Ngày đặt: {formatDate(order.createdAt)}</p></div>
                        <div className="flex items-center gap-2">{statusIcon(order.status)}<span className="text-sm font-medium text-gray-700">{order.status}</span></div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100"><Package className="h-6 w-6 text-gray-400" /></div><div><p className="font-semibold text-gray-900">{order.vehicle}</p><p className="text-sm text-gray-500">Thanh toán: {order.payment}</p></div></div>
                        <p className="font-bold text-[#836100]">{formatPrice(order.amount)}</p>
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