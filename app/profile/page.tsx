'use client'

import { FormEvent, Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useUser } from '@auth0/nextjs-auth0/client'
import { CheckCircle2, Clock, Loader2, MapPin, Package, User, XCircle, CarFront, X, Check, FileText, ArrowRight, CreditCard, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

import { Footer } from '@/components/footer'
import { Header } from '@/components/header'
import { PopupLoginButton } from '@/components/auth/popup-login-button'
import { UserAvatar } from '@/components/auth/user-avatar'
import { ProfileSavedAddresses } from '@/components/profile-saved-addresses'
import { ProductOptionSummary } from '@/components/product-option-summary'
import { ToastViewport, type ToastMessage } from '@/components/ui/toast'
import { getMyProfile, updateMyProfile, type CustomerProfile } from '@/lib/api/profile-client'
import type { AccessoryOrder, AccessoryOrderSummary } from '@/lib/cart/types'
import { contractStageCopy, getDepositContractMode } from '@/lib/deposit/contract-workflow'

function OrderItemThumbnail({ src, productName }: { src: string | null; productName: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-white text-gray-400"><Package className="h-5 w-5" /></div>
  return <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-gray-100 bg-white"><img src={src} alt={`Ảnh ${productName}`} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-contain" /></div>
}

function ProfileContent() {
  const { user, isLoading } = useUser()
  const searchParams = useSearchParams()
  const validTabs = ['info', 'orders', 'car-orders', 'addresses']
  const requestedTab = searchParams?.get('tab')
  const initialTab = validTabs.includes(requestedTab || '') ? requestedTab : 'info'
  const [activeTab, setActiveTab] = useState<'info' | 'orders' | 'car-orders' | 'addresses'>(initialTab as any)
  const router = useRouter()
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [fullName, setFullName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [profileLoading, setProfileLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [userOrders, setUserOrders] = useState<AccessoryOrderSummary[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState<string | null>(null)
  const [ordersPage, setOrdersPage] = useState(1)
  const [ordersMeta, setOrdersMeta] = useState({ page: 1, limit: 5, total: 0, totalPages: 0 })
  const [selectedOrder, setSelectedOrder] = useState<AccessoryOrderSummary | null>(null)
  const [selectedAccessoryOrder, setSelectedAccessoryOrder] = useState<AccessoryOrder | null>(null)
  const [accessoryOrderLoadingId, setAccessoryOrderLoadingId] = useState<string | null>(null)
  const [kycLoadingId, setKycLoadingId] = useState<string | null>(null)
  const [orderAction, setOrderAction] = useState<{ id: string; type: 'payment' | 'cancel' } | null>(null)

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab)
    router.push(`/profile?tab=${tab}`, { scroll: false })
  }

  function showToast(
    kind: ToastMessage['kind'],
    title: string,
    message?: string,
    actions?: Pick<ToastMessage, 'action' | 'secondaryAction'>,
  ) {
    const id = Date.now() + Math.random()
    const dismiss = () => setToasts((current) => current.filter((toast) => toast.id !== id))
    const wrap = (action: ToastMessage['action']) => action ? { ...action, onClick: () => { action.onClick(); dismiss() } } : undefined
    setToasts((current) => [...current, { id, kind, title, message, action: wrap(actions?.action), secondaryAction: wrap(actions?.secondaryAction) }])
    if (!actions?.action && !actions?.secondaryAction) window.setTimeout(dismiss, 4500)
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
    setOrdersPage(1)
  }, [activeTab])

  useEffect(() => {
    if (!user || (activeTab !== 'orders' && activeTab !== 'car-orders')) return

    let active = true
    setOrdersLoading(true)
    setOrdersError(null)
    setUserOrders([])
    const typeQuery = activeTab === 'orders' ? 'accessory' : 'car'
    fetch(`/api/v1/orders?page=${ordersPage}&limit=5&type=${typeQuery}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload.error?.message || 'Không thể tải đơn hàng.')
        }
        if (active) {
          setUserOrders(payload.data || [])
          setOrdersMeta(payload.meta || { page: ordersPage, limit: 5, total: 0, totalPages: 0 })
        }
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
  }, [activeTab, ordersPage, user])

  async function openAccessoryOrder(orderId: string) {
    setAccessoryOrderLoadingId(orderId)
    try {
      const response = await fetch(`/api/v1/orders/${encodeURIComponent(orderId)}`)
      const payload = await response.json().catch(() => ({})) as {
        data?: AccessoryOrder
        error?: { message?: string }
      }
      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message || 'Không thể tải chi tiết đơn hàng.')
      }
      setSelectedAccessoryOrder(payload.data)
    } catch (error) {
      showToast(
        'error',
        'Không thể tải chi tiết đơn hàng',
        error instanceof Error ? error.message : 'Vui lòng thử lại sau.',
      )
    } finally {
      setAccessoryOrderLoadingId(null)
    }
  }

  const handleStartKyc = async (order: AccessoryOrderSummary) => {
    setKycLoadingId(order.id)
    try {
      const res = await fetch('/api/kyc/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          customerName: profile?.fullName || user?.name || '',
          customerId: '', // Can be populated if user has ID stored
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Có lỗi khi tạo phiên KYC')
      }

      if (data.url || data.sessionId) {
        import('@didit-protocol/sdk-web').then(({ DiditSdk }) => {
          let hasCompleted = false;
          DiditSdk.shared.onComplete = async (result: any) => {
            if (result.type === 'completed') {
              hasCompleted = true;

              if (typeof (DiditSdk.shared as any).close === 'function') {
                (DiditSdk.shared as any).close();
              }

              try {
                // Update order status to PENDING_CONTRACT in backend
                const res = await fetch('/api/kyc/complete', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ orderId: order.id, sessionId: data.sessionId }),
                })

                if (!res.ok) {
                  const errData = await res.json()
                  if (errData.mismatch) {
                    showToast('error', 'Thông tin không khớp', 'Họ tên hoặc CCCD trên thẻ không khớp với thông tin đặt cọc ban đầu!')
                    return
                  } else {
                    showToast('error', 'Lỗi hệ thống', errData.error || 'Có lỗi xảy ra, vui lòng thử lại sau.')
                    throw new Error(errData.error || 'Failed to complete KYC')
                  }
                }

                showToast('success', 'KYC Thành công', 'Bạn đã vượt qua quá trình xác minh!')

                // Refetch orders list to reflect the new state (bypass cache)
                const response = await fetch(`/api/v1/orders?limit=20&type=${activeTab === 'orders' ? 'accessory' : 'car'}&_t=${Date.now()}`)
                if (response.ok) {
                  const payload = await response.json()
                  if (payload.data) setUserOrders(payload.data)
                }
              } catch (e: any) {
                console.error('Lỗi khi cập nhật trạng thái đơn hàng', e)
                if (e.message !== 'Failed to complete KYC' && !e.message.includes('Quá trình xác minh cần') && !e.message.includes('Schema cache') && !e.message.includes('schema cache')) {
                  showToast('error', 'Lỗi hệ thống', 'Không thể hoàn tất quá trình KYC lúc này.')
                }
              }
            } else if (result.type === 'cancelled') {
              if (!hasCompleted) {
                showToast('warning', 'Đã hủy', 'Bạn đã đóng quá trình xác thực KYC')
              }
            } else {
              showToast('error', 'Thất bại', 'Quá trình xác thực gặp lỗi')
            }
          }
          DiditSdk.shared.startVerification({
            url: data.url || undefined,
            sessionId: data.sessionId || undefined
          } as any)
        }).catch(err => {
          showToast('error', 'Lỗi tải SDK', 'Không thể khởi tạo nền tảng xác thực.')
        })
      } else {
        throw new Error('Didit API trả về kết quả không hợp lệ (không tìm thấy URL session)')
      }
    } catch (err: any) {
      showToast('error', 'Lỗi', err.message || 'Lỗi khi khởi tạo KYC')
    } finally {
      setKycLoadingId(null)
    }
  }


  async function payAccessoryOrder(order: AccessoryOrderSummary) {
    setOrderAction({ id: order.id, type: 'payment' })
    try {
      const response = await fetch(`/api/v1/orders/${encodeURIComponent(order.id)}/payment`, { method: 'POST' })
      const payload = await response.json().catch(() => ({})) as { data?: { paymentUrl?: string }; error?: { message?: string } }
      if (!response.ok || !payload.data?.paymentUrl) throw new Error(payload.error?.message || 'Không thể tạo giao dịch thanh toán.')
      window.location.assign(payload.data.paymentUrl)
    } catch (error) {
      showToast('error', 'Không thể thanh toán đơn hàng', error instanceof Error ? error.message : 'Vui lòng thử lại sau.')
      setOrderAction(null)
    }
  }

  async function payDepositOrder(order: AccessoryOrderSummary) {
    setOrderAction({ id: order.id, type: 'payment' })
    try {
      const response = await fetch(`/api/v1/deposit-orders/${encodeURIComponent(order.id)}/payment`, { method: 'POST' })
      const payload = await response.json().catch(() => ({})) as {
        data?: { paymentUrl?: string }
        error?: { message?: string }
      }
      if (!response.ok || !payload.data?.paymentUrl) {
        throw new Error(payload.error?.message || 'Không thể tạo lại giao dịch đặt cọc.')
      }
      window.location.assign(payload.data.paymentUrl)
    } catch (error) {
      showToast('error', 'Không thể thanh toán lại', error instanceof Error ? error.message : 'Vui lòng thử lại sau.')
      setOrderAction(null)
    }
  }

  async function payVehicleBalance(order: AccessoryOrderSummary) {
    setOrderAction({ id: order.id, type: 'payment' })
    try {
      const response = await fetch(`/api/v1/deposit-orders/${encodeURIComponent(order.id)}/balance-payment`, { method: 'POST' })
      const payload = await response.json().catch(() => ({})) as { data?: { paymentUrl?: string }; error?: { message?: string } }
      if (!response.ok || !payload.data?.paymentUrl) throw new Error(payload.error?.message || 'Không thể tạo giao dịch thanh toán.')
      window.location.assign(payload.data.paymentUrl)
    } catch (error) {
      showToast('error', 'Không thể thanh toán phần còn lại', error instanceof Error ? error.message : 'Vui lòng thử lại sau.')
      setOrderAction(null)
    }
  }

  function requestCancelAccessoryOrder(order: AccessoryOrderSummary) {
    const paid = order.paymentStatus === 'Paid'
    showToast('warning', 'Xác nhận hủy đơn hàng', paid
      ? 'Đơn đã thanh toán sẽ chuyển sang trạng thái chờ hoàn tiền.'
      : 'Đơn đang chờ thanh toán sẽ được chuyển sang trạng thái đã hủy.', {
      secondaryAction: { label: 'Giữ đơn hàng', onClick: () => undefined },
      action: { label: 'Hủy đơn hàng', variant: 'danger', onClick: () => void cancelAccessoryOrder(order) },
    })
  }

  async function cancelAccessoryOrder(order: AccessoryOrderSummary) {
    setOrderAction({ id: order.id, type: 'cancel' })
    try {
      const response = await fetch(`/api/v1/orders/${encodeURIComponent(order.id)}`, { method: 'DELETE' })
      const payload = await response.json().catch(() => ({})) as { data?: AccessoryOrder; error?: { message?: string } }
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || 'Không thể hủy đơn hàng.')
      const cancelled = payload.data
      setUserOrders((current) => current.map((item) => item.id === order.id ? {
        ...item,
        status: 'CANCELLED',
        statusUpdatedAt: cancelled.statusUpdatedAt,
        refundStatus: cancelled.refundStatus,
        paymentStatus: cancelled.payment.status,
      } : item))
      if (selectedAccessoryOrder?.id === order.id) setSelectedAccessoryOrder(cancelled)
      showToast('success', cancelled.refundStatus === 'Pending' ? 'Đã hủy - Chờ hoàn tiền' : 'Đã hủy đơn hàng')
    } catch (error) {
      showToast('error', 'Không thể hủy đơn hàng', error instanceof Error ? error.message : 'Vui lòng thử lại sau.')
    } finally {
      setOrderAction(null)
    }
  }

  function requestCancelDepositOrder(order: AccessoryOrderSummary) {
    showToast(
      'warning',
      'Xác nhận hủy đơn đặt cọc',
      order.paymentStatus === 'Paid'
        ? 'Đơn đã thanh toán tiền cọc. Khoản cọc sẽ được xử lý theo chính sách hủy.'
        : 'Đơn chưa thanh toán sẽ được chuyển sang trạng thái đã hủy.',
      {
        secondaryAction: { label: 'Giữ đơn', onClick: () => undefined },
        action: { label: 'Hủy đơn', variant: 'danger', onClick: () => void cancelDepositOrder(order) },
      },
    )
  }

  async function cancelDepositOrder(order: AccessoryOrderSummary) {
    setOrderAction({ id: order.id, type: 'cancel' })
    try {
      const response = await fetch(`/api/v1/deposit-orders/${encodeURIComponent(order.id)}`, { method: 'DELETE' })
      const payload = await response.json().catch(() => ({})) as {
        data?: { status: string; updated_at: string }
        error?: { message?: string }
      }
      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message || 'Không thể hủy đơn đặt cọc.')
      }
      setUserOrders((current) => current.map((item) => item.id === order.id ? {
        ...item,
        status: 'CANCELLED',
        refundStatus: order.paymentStatus === 'Paid' ? 'Pending' : 'None',
        statusUpdatedAt: payload.data?.updated_at || item.statusUpdatedAt,
      } : item))
      showToast(
        'success',
        order.paymentStatus === 'Paid' ? 'Đã hủy - Chờ hoàn tiền' : 'Đã hủy đơn đặt cọc',
        order.paymentStatus === 'Paid' ? 'Khoản tiền cọc đang chờ được xử lý hoàn tiền.' : undefined,
      )
    } catch (error) {
      showToast('error', 'Không thể hủy đơn đặt cọc', error instanceof Error ? error.message : 'Vui lòng thử lại sau.')
    } finally {
      setOrderAction(null)
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
          <PopupLoginButton className="mt-4 inline-block rounded-full bg-[#836100] px-6 py-3 font-bold text-white transition-colors hover:bg-[#6a4e00]">Đăng nhập ngay</PopupLoginButton>
        </div>
        <Footer />
      </main>
    )
  }

  const displayName = profile?.fullName || user.name || 'Tài khoản'
  const formatPrice = (price: number | string) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(price))
  const formatDate = (date: string) => new Date(date).toLocaleDateString('vi-VN')
  const formatVietnamDateTime = (date: string) => {
    const instant = new Date(date)
    if (Number.isNaN(instant.getTime())) return 'Chưa cập nhật'

    return `${new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).format(instant)} (GMT+7)`
  }
  const statusIcon = (status: string) => ['Completed', 'Paid', 'Confirmed', 'CONFIRMED'].includes(status)
    ? <CheckCircle2 className="h-5 w-5 text-green-500" />
    : status === 'Cancelled' || status === 'CANCELLED' || status === 'FAILED'
      ? <XCircle className="h-5 w-5 text-red-500" />
      : <Clock className="h-5 w-5 text-yellow-500" />

  const translateStatus = (s: string, isCar: boolean, refundStatus?: AccessoryOrder['refundStatus']) => {
    if (isCar) {
      return {
        'PENDING_DEPOSIT': 'Chờ cọc',
        'PENDING_CONFIRMATION': 'Chờ xét duyệt cọc',
        'CONFIRMED': 'Đã xác nhận',
        'PENDING_CONTRACT': 'Chờ tạo HĐ',
        'CONTRACT_SIGNED': 'Đã ký HĐ',
        'PENDING_PAYMENT': 'Chờ thanh toán',
        'PAID': 'Đã thanh toán',
        'PREPARING_DELIVERY': 'Chờ giao xe',
        'DELIVERED': 'Đã giao xe',
        'COMPLETED': 'Hoàn thành',
        'CANCELLED': 'Đã hủy cọc',
        'PENDING': 'Chờ xác nhận cọc', // Legacy
        'Pending': 'Chờ xác nhận cọc', // Fallbacks
        'Processing': 'Chờ giao xe',
        'Shipped': 'Đang vận chuyển',
        'Completed': 'Đã nhận xe',
        'Cancelled': 'Đã hủy cọc',
        'Confirmed': 'Đã xác nhận',
      }[s] || s
    }
    if ((s === 'Cancelled' || s === 'CANCELLED') && refundStatus === 'Pending') return 'Đã Hủy - Chờ Hoàn Tiền'
    return {
      'Created': 'Chờ Thanh Toán',
      'Paid': 'Đã Thanh Toán',
      'Pending': 'Chờ Thanh Toán',
      'Processing': 'Đang chuẩn bị hàng',
      'Shipped': 'Đang giao hàng',
      'Completed': 'Giao thành công',
      'Cancelled': 'Đã hủy',
      'CANCELLED': 'Đã Hủy',
      'Confirmed': 'Đã xác nhận',
    }[s] || s
  }

  const translatePaymentStatus = (s: string, isCar: boolean) => {
    if (isCar) {
      return {
        'Pending': 'Chưa đặt cọc',
        'Paid': 'Đã đặt cọc',
        'Refunded': 'Đã hoàn cọc',
        'Failed': 'Thanh toán lỗi',
      }[s] || s
    }
    return {
      'Pending': 'Chờ Thanh Toán',
      'Paid': 'Đã Thanh Toán',
      'Refunded': 'Đã hoàn tiền',
      'Failed': 'Thất bại',
    }[s] || s
  }

  return (
    <main className="flex min-h-screen flex-col bg-gray-50">
      <Header />
      <ToastViewport toasts={toasts} onClose={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
      <div className="mx-auto flex w-full max-w-[1200px] flex-1 px-6 py-32">
        <div className="flex w-full flex-col gap-8 md:flex-row">
          <aside className="w-full shrink-0 md:w-64">
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className="border-b border-gray-100 p-6 text-center">
                <UserAvatar
                  picture={user.picture}
                  name={displayName}
                  className="mx-auto mb-4 h-20 w-20"
                  iconClassName="text-gray-400"
                  iconSize={32}
                />
                <h2 className="font-bold text-gray-900">{displayName}</h2>
                <p className="mt-1 truncate text-xs text-gray-500">{profile?.email || user.email}</p>
              </div>
              <div className="p-2">
                <button onClick={() => handleTabChange('info')} className={`w-full rounded-xl px-4 py-3 text-left text-sm font-medium transition-colors ${activeTab === 'info' ? 'bg-[#836100]/10 text-[#836100]' : 'text-gray-600 hover:bg-gray-50'}`}><User className="mr-3 inline-block h-4 w-4" />Hồ sơ của tôi</button>
                <button onClick={() => handleTabChange('addresses')} className={`w-full rounded-xl px-4 py-3 text-left text-sm font-medium transition-colors ${activeTab === 'addresses' ? 'bg-[#836100]/10 text-[#836100]' : 'text-gray-600 hover:bg-gray-50'}`}><MapPin className="mr-3 inline-block h-4 w-4" />Địa chỉ của tôi</button>
                <button onClick={() => handleTabChange('orders')} className={`w-full rounded-xl px-4 py-3 text-left text-sm font-medium transition-colors ${activeTab === 'orders' ? 'bg-[#836100]/10 text-[#836100]' : 'text-gray-600 hover:bg-gray-50'}`}><Package className="mr-3 inline-block h-4 w-4" />Lịch sử mua hàng</button>
                <button onClick={() => handleTabChange('car-orders')} className={`w-full rounded-xl px-4 py-3 text-left text-sm font-medium transition-colors ${activeTab === 'car-orders' ? 'bg-[#836100]/10 text-[#836100]' : 'text-gray-600 hover:bg-gray-50'}`}><CarFront className="mr-3 inline-block h-4 w-4" />Lịch sử mua xe</button>
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
            ) : activeTab === 'addresses' ? (
              <ProfileSavedAddresses profileName={profile?.fullName ?? ''} profilePhone={profile?.phoneNumber ?? ''} showToast={showToast} />
            ) : (
              <div>
                <h2 className="mb-6 text-2xl font-bold text-gray-900">
                  {activeTab === 'orders' ? 'Lịch sử mua hàng' : 'Lịch sử mua xe'}
                </h2>
                <div className="space-y-4">
                  {ordersLoading && (
                    <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-[#836100]" /></div>
                  )}
                  {ordersError && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{ordersError}</p>}
                  {!ordersLoading && !ordersError && userOrders.length === 0 && (
                    <p className="rounded-xl bg-gray-50 p-8 text-center text-sm text-gray-500">Bạn chưa có đơn hàng nào.</p>
                  )}
                  {userOrders.map(order => {
                    if (activeTab === 'car-orders') {
                      const status = order.status;
                      const vVariant = order.depositDetails?.vehicleVariant;

                      const cleanCarModel = (vVariant?.product_name || order.carModel || '').replace(/vinfast\s*/i, '').trim();
                      let cleanCarVariant = (vVariant?.variant_name || vVariant?.version || order.carVariant || '').replace(/vinfast\s*/i, '').trim();

                      // Remove base model (e.g. 'VF 8') from variant if model already has it to avoid duplication
                      const modelMatch = cleanCarModel.match(/VF\s*\d+/i);
                      if (modelMatch) {
                        const regex = new RegExp(modelMatch[0] + '\\s*', 'i');
                        cleanCarVariant = cleanCarVariant.replace(regex, '').trim();
                      }

                      const carName = `${cleanCarModel} ${cleanCarVariant}`.trim();

                      const getVehicleImage = (model: string, variantImg?: string) => {
                        if (variantImg) return variantImg;
                        const m = (model || '').toLowerCase().trim();
                        if (m.includes('vf 9') || m.includes('vf9')) return 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dwf3c2decf/images/PDP/vf9/202406/exterior/CE1V.webp';
                        if (m.includes('vf 8') || m.includes('vf8')) return 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw7afb0815/reserves/VF8/exterior/product-CE11.webp';
                        if (m.includes('vf 7') || m.includes('vf7')) return 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw4c3e07c9/reserves/VF7/exterior/product-CE1M.webp';
                        if (m.includes('vf 6') || m.includes('vf6')) return 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw445cc03b/images/VF6/JB10V/CE18.webp';
                        if (m.includes('vf 5') || m.includes('vf5')) return 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw15aebeed/reserves/VF5/2025/10.webp';
                        if (m.includes('vf 3') || m.includes('vf3')) return 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784768418972/ldp-all-cars/360/VF3/exterior/181U/F1.png';
                        if (m.includes('vf 2') || m.includes('vf2')) return 'https://vinfastauto.com/themes/porto/img/pdp-page/vf2/vf2-car/vf2-urbant-mint-car.webp';
                        if (m.includes('mpv')) return 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VFMPV7/SL1WV/CE18.webp';
                        if (m.includes('vento')) return '/images/vento.png';
                        if (m.includes('kinet')) return 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dw8fe35f6f/images/KINET/BAUVN.png';
                        if (m.includes('kyo')) return 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-vinfast_vn_master/default/dwe9e8a96e/images/KYO/BRQVN.png';
                        return '/images/car-sale.png';
                      };
                      const carImage = getVehicleImage(cleanCarModel, vVariant?.image_car_url);

                      let stateIcon = <Clock className="w-5 h-5 shrink-0 text-gray-500" />;
                      let stateText = translateStatus(status, true);
                      let actionBtn = null;

                      switch (status) {
                        case 'PENDING_DEPOSIT':
                        case 'PENDING':
                          stateIcon = <Clock className="w-5 h-5 shrink-0 text-blue-500" />;
                          stateText = 'Chờ thanh toán tiền đặt cọc.';
                          break;
                        case 'PENDING_CONFIRMATION':
                          stateIcon = order.paymentStatus === 'Paid'
                            ? <CheckCircle2 className="w-5 h-5 shrink-0 text-green-500" />
                            : <Clock className="w-5 h-5 shrink-0 text-amber-500" />;
                          stateText = order.paymentStatus === 'Paid'
                            ? 'Đã thanh toán. Đang chờ FastLane xét duyệt và xác nhận đơn đặt cọc.'
                            : 'Chưa thanh toán tiền đặt cọc.';
                          break;
                        case 'CONFIRMED':
                          stateIcon = <CheckCircle2 className="w-5 h-5 shrink-0 text-green-500" />;
                          stateText = 'Xác thực KYC: Đã xét duyệt đơn cọc. Vui lòng tải lên CCCD/CMND để xác thực KYC & hoàn thiện hồ sơ.';
                          actionBtn = (
                            <button
                              onClick={() => handleStartKyc(order)}
                              disabled={kycLoadingId === order.id}
                              className="w-full h-12 flex items-center justify-center gap-2 rounded-xl font-bold text-sm bg-[#836100] text-white hover:bg-[#6a4e00] transition-all shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                              {kycLoadingId === order.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Tải lên CCCD (KYC)'}
                            </button>
                          );
                          break;
                        case 'PENDING_CONTRACT':
                          stateIcon = <FileText className="w-5 h-5 shrink-0 text-indigo-500" />;
                          {
                            const contractCopy = contractStageCopy(getDepositContractMode({
                              vehicle_type: (order as any).vehicleType,
                              car_variant: (order as any).carVariant,
                              vehicle_variants: (order as any).depositDetails?.vehicleVariant,
                            }))
                            stateText = contractCopy.status;
                            actionBtn = (
                              <button onClick={() => router.push(`/profile/contract/${order.id}`)} className="w-full h-12 flex items-center justify-center gap-2 rounded-xl font-bold text-sm border border-indigo-600 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all">
                                {contractCopy.action}
                              </button>
                            );
                          }
                          break;
                        case 'CONTRACT_SIGNED':
                        case 'PENDING_PAYMENT':
                          stateIcon = <Clock className="w-5 h-5 shrink-0 text-orange-500" />;
                          stateText = 'Thanh toán phần còn lại: Đang chờ thanh toán số tiền còn lại của giá trị xe (hoặc đối ứng ngân hàng).';
                          actionBtn = (
                            <button
                              type="button"
                              onClick={() => void payVehicleBalance(order)}
                              disabled={orderAction?.id === order.id}
                              className="w-full h-12 flex items-center justify-center gap-2 rounded-xl font-bold text-sm bg-orange-600 text-white hover:bg-orange-700 transition-all disabled:cursor-wait disabled:opacity-60"
                            >
                              {orderAction?.id === order.id && orderAction.type === 'payment' && <Loader2 className="h-4 w-4 animate-spin" />}
                              Thanh toán phần còn lại
                            </button>
                          );
                          break;
                        case 'PAID':
                        case 'PREPARING_DELIVERY':
                          stateIcon = <Package className="w-5 h-5 shrink-0 text-purple-500" />;
                          stateText = 'Đã thanh toán thành công. Xe đang được chuẩn bị bàn giao!';
                          break;
                        case 'DELIVERED':
                        case 'COMPLETED':
                          stateIcon = <CheckCircle2 className="w-5 h-5 shrink-0 text-green-500" />;
                          stateText = 'Đã nhận xe thành công. Chúc bạn có những chuyến đi tuyệt vời!';
                          break;
                        case 'CANCELLED':
                          stateIcon = <XCircle className="w-5 h-5 shrink-0 text-red-500" />;
                          stateText = order.refundStatus === 'Completed'
                            ? 'Đơn đã hủy và tiền đặt cọc đã được hoàn.'
                            : order.paymentStatus === 'Paid'
                              ? 'Đơn đã hủy, đang chờ hoàn tiền đặt cọc.'
                              : 'Đơn hàng đã bị hủy.';
                          break;
                      }

                      const currentStepIdx = (() => {
                        if (['PENDING_CONFIRMATION', 'PENDING_DEPOSIT', 'PENDING'].includes(status)) return 1;
                        if (['CONFIRMED'].includes(status)) return 2;
                        if (['PENDING_CONTRACT'].includes(status)) return 3;
                        if (['CONTRACT_SIGNED', 'PENDING_PAYMENT'].includes(status)) return 4;
                        if (['PAID', 'PREPARING_DELIVERY', 'DELIVERED', 'COMPLETED'].includes(status)) return 5;
                        return 1;
                      })();

                      const stepsList = [
                        { step: 1, label: '1. Chờ xét duyệt' },
                        { step: 2, label: '2. Xác thực KYC' },
                        { step: 3, label: '3. Ký hợp đồng' },
                        { step: 4, label: '4. Thanh toán' },
                      ];

                      const stateBox = (
                        <div className="w-full space-y-3">
                          {status !== 'CANCELLED' && (
                            <div className="w-full bg-gray-50 border border-gray-100 p-3 rounded-xl">
                              <div className="grid grid-cols-4 gap-1 text-[11px] font-bold text-center mb-1.5">
                                {stepsList.map(s => (
                                  <span key={s.step} className={s.step === currentStepIdx ? 'text-[#836100]' : s.step < currentStepIdx ? 'text-green-600' : 'text-gray-400'}>
                                    {s.label}
                                  </span>
                                ))}
                              </div>
                              <div className="flex h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                {stepsList.map(s => (
                                  <div
                                    key={s.step}
                                    className={`flex-1 border-r last:border-r-0 border-white transition-all ${s.step < currentStepIdx ? 'bg-green-500' : s.step === currentStepIdx ? 'bg-[#836100]' : 'bg-gray-200'
                                      }`}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="flex items-start gap-3 bg-white border border-gray-200 p-4 rounded-xl shadow-sm">
                            {stateIcon}
                            <span className="text-sm font-medium text-gray-700 leading-snug">{stateText}</span>
                          </div>
                        </div>
                      );

                      const showPaidBadge = order.paymentStatus === 'Paid';
                      const displayColor = (order as any).exteriorColor || vVariant?.color || '';

                      return (
                        <div key={order.id} className="border border-gray-200 rounded-2xl p-7 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 bg-white shadow-sm flex flex-col lg:flex-row gap-8 items-stretch">

                          {/* LEFT: Image */}
                          <div className="w-full lg:w-[220px] shrink-0 flex flex-col items-center justify-center">
                            <div className="aspect-[4/3] w-full relative">
                              <img
                                src={carImage}
                                alt={carName}
                                className="w-full h-full object-contain mix-blend-multiply"
                                onError={(e) => {
                                  e.currentTarget.src = 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw7afb0815/reserves/VF8/exterior/product-CE11.webp';
                                  e.currentTarget.onerror = null;
                                }}
                              />
                            </div>
                            {showPaidBadge && (
                              <div className="mt-4 bg-green-500 text-white text-sm font-bold px-4 py-1.5 rounded-full shadow-sm flex items-center justify-center gap-1.5 h-8 w-fit mx-auto">
                                <CheckCircle2 className="w-4 h-4" /> {status === 'COMPLETED' ? 'Đã hoàn thành' : 'Đã thanh toán'}
                              </div>
                            )}
                          </div>

                          {/* MIDDLE: Car Info & Timeline */}
                          <div className="flex-1 flex flex-col items-center text-center justify-center min-w-0 py-2">
                            <h3 className="text-3xl font-bold text-gray-900 tracking-tight leading-tight mb-2">
                              VinFast {cleanCarModel}
                            </h3>
                            <p className="text-[15px] leading-relaxed text-gray-500 font-medium mb-6 text-balance max-w-sm mx-auto line-clamp-3">
                              {cleanCarVariant}{displayColor ? ` / ${displayColor}` : ''}
                            </p>

                            <div className="mb-6 flex flex-col items-center gap-4 w-full px-4">
                              <div className="flex flex-col items-center">
                                <p className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-1">Tiền cọc</p>
                                <p className="text-[#836100] text-3xl font-bold">
                                  {formatPrice(order.pricing.amountDueNow)}
                                </p>
                              </div>
                              {Number(order.pricing.balanceDue) > 0 && (
                                <div className="flex flex-col items-center">
                                  <p className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-1">Còn lại cần thanh toán</p>
                                  <p className="text-gray-900 text-xl font-bold">
                                    {formatPrice(order.pricing.balanceDue)}
                                  </p>
                                </div>
                              )}
                            </div>

                            <div className="mt-auto flex justify-center">
                              {stateBox}
                            </div>
                          </div>

                          {/* RIGHT: Order Summary */}
                          <div className="w-full lg:w-[280px] shrink-0 flex flex-col gap-4">
                            <div className="bg-gray-50 rounded-xl border border-gray-100 p-6 flex-1 flex flex-col justify-center gap-6">
                              <div>
                                <p className="text-xs text-gray-400 uppercase tracking-widest font-bold mb-1">Mã đơn</p>
                                <p className="text-xl font-bold text-gray-900">{order.orderNumber}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-400 uppercase tracking-widest font-bold mb-1">Ngày đặt</p>
                                <p className="text-base font-bold text-gray-700">{formatDate(order.createdAt)}</p>
                              </div>
                            </div>

                            <div className="flex flex-col gap-3">
                              <button
                                onClick={() => setSelectedOrder(order)}
                                className="w-full h-12 flex items-center justify-center gap-2 rounded-xl font-bold text-sm bg-gray-900 text-white hover:bg-gray-800 transition-all group shadow-sm"
                              >
                                Xem chi tiết <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                              </button>
                              {actionBtn && (
                                <div className="w-full">
                                  {actionBtn}
                                </div>
                              )}
                              {status === 'PENDING_DEPOSIT' && order.paymentStatus === 'Pending' && (
                                <button
                                  type="button"
                                  onClick={() => void payDepositOrder(order)}
                                  disabled={orderAction?.id === order.id}
                                  className="w-full h-12 flex items-center justify-center gap-2 rounded-xl bg-[#836100] font-bold text-sm text-white transition-all hover:bg-[#6a4e00] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#836100]/40 disabled:cursor-wait disabled:opacity-60"
                                >
                                  {orderAction?.id === order.id && orderAction.type === 'payment'
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : <CreditCard className="h-4 w-4" />}
                                  Thanh toán lại
                                </button>
                              )}
                              {['PENDING_DEPOSIT', 'PENDING_CONFIRMATION', 'PENDING', 'CONFIRMED'].includes(status) && (
                                <button
                                  type="button"
                                  onClick={() => requestCancelDepositOrder(order)}
                                  disabled={orderAction?.id === order.id}
                                  className="w-full h-12 flex items-center justify-center gap-2 rounded-xl border border-red-300 font-bold text-sm text-red-600 transition-all hover:bg-red-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-wait disabled:opacity-60"
                                >
                                  {orderAction?.id === order.id && orderAction.type === 'cancel'
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : <Trash2 className="h-4 w-4" />}
                                  Hủy đơn đặt cọc
                                </button>
                              )}
                            </div>
                          </div>

                        </div>
                      )
                    }

                    // Original Accessory Order UI
                    const accessoryStatus = String(order.status)
                    const canPay = ['Created', 'Pending', 'PENDING'].includes(accessoryStatus) && order.paymentStatus === 'Pending'
                    const canCancel = canPay || ['Paid', 'PAID'].includes(accessoryStatus)
                    const paymentFailed = canPay && order.latestPaymentAttemptStatus === 'FAILED'
                    const actionBusy = orderAction?.id === order.id
                    const paymentBusy = actionBusy && orderAction?.type === 'payment'
                    const cancellationBusy = actionBusy && orderAction?.type === 'cancel'
                    const displayStatus = paymentFailed ? 'Thanh toán thất bại' : translateStatus(order.status, false, order.refundStatus)
                    const isCancelled = ['Cancelled', 'CANCELLED'].includes(accessoryStatus)
                    const statusBadgeClass = isCancelled && order.refundStatus === 'Pending'
                      ? 'border-orange-200 bg-orange-50 text-orange-700'
                      : isCancelled
                        ? 'border-red-200 bg-red-50 text-red-700'
                        : paymentFailed
                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : order.paymentStatus === 'Paid'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-amber-200 bg-amber-50 text-amber-700'
                    return (
                      <article key={order.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-[#836100]/30 hover:shadow-md">
                        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-5 py-4">
                          <div>
                            <p className="text-sm font-bold text-gray-900">{order.orderNumber}</p>
                            <p className="mt-1 text-xs text-gray-500">Ngày đặt: {formatDate(order.createdAt)}</p>
                          </div>
                          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${statusBadgeClass}`}>
                            {statusIcon(order.status)}
                            <span>{displayStatus}</span>
                          </div>
                        </header>

                        <div className="grid gap-5 px-5 py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                          <section className="min-w-0">
                            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Sản phẩm</p>
                            <div className="min-w-0">
                              <ul className="min-w-0 flex-1 divide-y divide-gray-100">
                                {(order.items ?? []).map((item) => (
                                  <li key={item.id} className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0 text-sm text-gray-700">
                                    <div className="flex min-w-0 items-center gap-3">
                                      <OrderItemThumbnail src={item.thumbnailUrl} productName={item.productName} />
                                      <span className="min-w-0 font-semibold text-gray-900">{item.productName}</span>
                                    </div>
                                    <span className="shrink-0 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">× {item.quantity}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </section>
                          <div className="md:min-w-36 md:text-right">
                            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Tổng cộng</p>
                            <p className="mt-2 text-lg font-bold text-[#836100]">{formatPrice(order.pricing.grandTotal)}</p>
                          </div>
                        </div>

                        <footer className="flex flex-wrap justify-end gap-2 border-t border-gray-200 bg-gray-50/70 px-5 py-3.5">
                          {canPay && (
                            <button type="button" onClick={() => void payAccessoryOrder(order)} disabled={actionBusy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#836100] px-4 text-sm font-bold text-white transition hover:bg-[#6a4e00] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#836100]/40 disabled:cursor-wait disabled:opacity-60">
                              {paymentBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                              {paymentFailed ? 'Thanh toán lại' : 'Thanh toán'}
                            </button>
                          )}
                          {canCancel && (
                            <button type="button" onClick={() => requestCancelAccessoryOrder(order)} disabled={actionBusy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-red-300 px-4 text-sm font-bold text-red-600 transition hover:bg-red-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-wait disabled:opacity-60">
                              {cancellationBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              Hủy đơn hàng
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void openAccessoryOrder(order.id)}
                            disabled={accessoryOrderLoadingId === order.id}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#836100] px-4 text-sm font-bold text-[#836100] transition hover:bg-[#836100] hover:text-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#836100]/40 disabled:cursor-wait disabled:opacity-60"
                          >
                            {accessoryOrderLoadingId === order.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <ArrowRight className="h-4 w-4" />}
                            Xem chi tiết
                          </button>
                        </footer>
                      </article>
                    )
                  })}
                  {!ordersLoading && !ordersError && ordersMeta.totalPages > 1 && (
                    <nav aria-label="Phân trang đơn hàng" className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 sm:flex-row">
                      <p className="text-sm text-gray-500">
                        Hiển thị {(ordersMeta.page - 1) * ordersMeta.limit + 1}–{Math.min(ordersMeta.page * ordersMeta.limit, ordersMeta.total)} trong {ordersMeta.total} đơn hàng
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setOrdersPage((page) => Math.max(1, page - 1))}
                          disabled={ordersMeta.page <= 1}
                          aria-label="Trang trước"
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-700 transition hover:border-[#836100] hover:text-[#836100] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#836100]/40 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="min-w-24 text-center text-sm font-semibold text-gray-700">
                          Trang {ordersMeta.page} / {ordersMeta.totalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => setOrdersPage((page) => Math.min(ordersMeta.totalPages, page + 1))}
                          disabled={ordersMeta.page >= ordersMeta.totalPages}
                          aria-label="Trang sau"
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-700 transition hover:border-[#836100] hover:text-[#836100] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#836100]/40 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </nav>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      <AnimatePresence>
        {selectedAccessoryOrder && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={() => setSelectedAccessoryOrder(null)}
              className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm"
            />
            <div className="pointer-events-none fixed inset-0 z-[101] flex items-center justify-center p-4 sm:p-6">
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby="accessory-order-detail-title"
                initial={{ opacity: 0, scale: 0.98, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 12 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setSelectedAccessoryOrder(null)
                }}
                className="pointer-events-auto flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
              >
                <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
                  <div>
                    <h3 id="accessory-order-detail-title" className="text-xl font-bold text-gray-900">
                      Chi tiết đơn phụ kiện
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">Mã đơn: {selectedAccessoryOrder.orderNumber}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                      <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                      Tạo lúc {formatVietnamDateTime(selectedAccessoryOrder.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedAccessoryOrder(null)}
                    aria-label="Đóng chi tiết đơn phụ kiện"
                    className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#836100]/40"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-6 overflow-y-auto p-6">
                  <section aria-labelledby="accessory-order-products-title">
                    <h4 id="accessory-order-products-title" className="mb-3 border-l-4 border-[#836100] pl-3 text-sm font-bold uppercase tracking-wider text-gray-900">
                      Sản phẩm
                    </h4>
                    <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-gray-50 px-4">
                      {selectedAccessoryOrder.items.map((item) => (
                        <article key={item.id} className="flex gap-4 py-4">
                          <OrderItemThumbnail src={item.thumbnailUrl} productName={item.productName} />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-gray-900">{item.productName}</p>
                            <ProductOptionSummary options={item.selectedOptions} className="mt-1.5" />
                            <p className="mt-1.5 text-xs text-gray-500">SKU: {item.sku} · Số lượng: {item.quantity}</p>
                          </div>
                          <p className="shrink-0 text-sm font-bold text-[#836100]">{formatPrice(item.lineTotal)}</p>
                        </article>
                      ))}
                    </div>
                  </section>

                  <section aria-labelledby="accessory-order-shipping-title">
                    <h4 id="accessory-order-shipping-title" className="mb-3 border-l-4 border-[#836100] pl-3 text-sm font-bold uppercase tracking-wider text-gray-900">
                      Thông tin nhận hàng
                    </h4>
                    <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
                      <p className="font-semibold text-gray-900">{selectedAccessoryOrder.shippingAddress.recipientName}</p>
                      <p className="mt-1">{selectedAccessoryOrder.shippingAddress.phoneNumber}</p>
                      <p className="mt-1 leading-6">
                        {selectedAccessoryOrder.shippingAddress.line1}
                        {selectedAccessoryOrder.shippingAddress.line2 ? `, ${selectedAccessoryOrder.shippingAddress.line2}` : ''}, {' '}
                        {selectedAccessoryOrder.shippingAddress.communeLevel.name}, {selectedAccessoryOrder.shippingAddress.province.name}
                      </p>
                      {selectedAccessoryOrder.note && <p className="mt-2 border-t border-gray-200 pt-2">Ghi chú: {selectedAccessoryOrder.note}</p>}
                    </div>
                  </section>

                  <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">Trạng thái</p>
                      <p className="mt-1 text-sm font-semibold text-gray-800">{['Created', 'Pending', 'PENDING'].includes(String(selectedAccessoryOrder.status)) && selectedAccessoryOrder.payment.status === 'Pending' && selectedAccessoryOrder.latestPaymentAttemptStatus === 'FAILED' ? 'Thanh toán thất bại' : translateStatus(selectedAccessoryOrder.status, false, selectedAccessoryOrder.refundStatus)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Tổng thanh toán</p>
                      <p className="mt-1 text-xl font-bold text-[#836100]">{formatPrice(selectedAccessoryOrder.pricing.grandTotal)}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Vehicle order details */}
      <AnimatePresence>
        {selectedOrder && selectedOrder.orderType === 'deposit' && selectedOrder.depositDetails && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedOrder(null)}
              className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm"
            />
            <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 sm:p-6 pointer-events-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl pointer-events-auto flex flex-col"
              >
                <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Chi tiết đơn mua xe</h3>
                    <p className="text-sm text-gray-500">Mã đơn: {selectedOrder.orderNumber}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                      <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                      Tạo lúc {formatVietnamDateTime(selectedOrder.createdAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedOrder(null)}
                    aria-label="Đóng chi tiết đơn mua xe"
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-6 space-y-8">
                  {/* Image & Xe Header */}
                  <div className="flex flex-col sm:flex-row items-center gap-6 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <div className="w-48 h-32 relative shrink-0">
                      <img
                        src={(() => {
                          const m = selectedOrder.depositDetails.vehicleVariant?.product_name || selectedOrder.carModel || '';
                          const img = selectedOrder.depositDetails.vehicleVariant?.image_car_url;
                          if (img) return img;
                          const lower = m.toLowerCase();
                          if (lower.includes('vf 9') || lower.includes('vf9')) return 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dwf3c2decf/images/PDP/vf9/202406/exterior/CE1V.webp';
                          if (lower.includes('vf 8') || lower.includes('vf8')) return 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw7afb0815/reserves/VF8/exterior/product-CE11.webp';
                          if (lower.includes('vf 7') || lower.includes('vf7')) return 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw4c3e07c9/reserves/VF7/exterior/product-CE1M.webp';
                          if (lower.includes('vf 6') || lower.includes('vf6')) return 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw445cc03b/images/VF6/JB10V/CE18.webp';
                          if (lower.includes('vf 5') || lower.includes('vf5')) return 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dw15aebeed/reserves/VF5/2025/10.webp';
                          if (lower.includes('vf 3') || lower.includes('vf3')) return 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784768418972/ldp-all-cars/360/VF3/exterior/181U/F1.png';
                          if (lower.includes('vf 2') || lower.includes('vf2')) return 'https://vinfastauto.com/themes/porto/img/pdp-page/vf2/vf2-car/vf2-urbant-mint-car.webp';
                          if (lower.includes('mpv')) return 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/vi_VN/v1784854804001/images/VFMPV7/SL1WV/CE18.webp';
                          if (lower.includes('vento')) return '/images/vento.png';
                          return '/images/car-sale.png';
                        })()}
                        alt="Hình ảnh xe"
                        className="w-full h-full object-contain mix-blend-multiply"
                      />
                    </div>
                    <div className="text-center sm:text-left">
                      <h4 className="text-2xl font-bold text-gray-900">
                        VinFast {(selectedOrder.depositDetails.vehicleVariant?.product_name || selectedOrder.carModel || '').replace(/vinfast/i, '').trim()}
                      </h4>
                      <p className="text-gray-500 font-medium mt-1">
                        {selectedOrder.depositDetails.vehicleVariant?.variant_name || selectedOrder.depositDetails.vehicleVariant?.version || selectedOrder.carVariant}
                      </p>
                    </div>
                  </div>

                  {/* Thông tin xe */}
                  <section>
                    <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 border-l-4 border-[#836100] pl-3">Thông tin xe</h4>
                    <div className="bg-gray-50 rounded-xl p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Dòng xe</p>
                        <p className="font-semibold text-gray-900">{selectedOrder.depositDetails.vehicleVariant?.product_name || selectedOrder.carModel}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Phiên bản</p>
                        <p className="font-semibold text-gray-900">{selectedOrder.depositDetails.vehicleVariant?.variant_name || selectedOrder.depositDetails.vehicleVariant?.version || selectedOrder.carVariant}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Màu ngoại thất</p>
                        <p className="font-semibold text-gray-900">{selectedOrder.depositDetails.vehicleVariant?.color || selectedOrder.depositDetails.exteriorColor}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Màu nội thất</p>
                        <p className="font-semibold text-gray-900">{selectedOrder.depositDetails.interiorColor}</p>
                      </div>
                    </div>
                  </section>

                  {/* Thông tin thanh toán */}
                  <section>
                    <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 border-l-4 border-[#836100] pl-3">Thanh toán & Giao nhận</h4>
                    <div className="bg-gray-50 rounded-xl p-5 space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Showroom nhận xe</span>
                        <span className="font-semibold text-gray-900 text-right">{selectedOrder.depositDetails.showroom}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Tổng giá trị dự kiến</span>
                        <span className="font-bold text-gray-900">{formatPrice(selectedOrder.depositDetails.totalEstimatedPrice)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Trạng thái đặt cọc</span>
                        <span className={`rounded-full px-3 py-1 text-sm font-bold ${selectedOrder.status === 'CANCELLED'
                          ? 'bg-red-100 text-red-700'
                          : selectedOrder.paymentStatus === 'Paid'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-amber-100 text-amber-700'
                          }`}>
                          {selectedOrder.status === 'CANCELLED'
                            ? selectedOrder.refundStatus === 'Completed'
                              ? 'Đã hủy, đã hoàn tiền'
                              : selectedOrder.paymentStatus === 'Paid'
                                ? 'Đã hủy, chờ hoàn tiền'
                                : 'Đã hủy cọc'
                            : selectedOrder.paymentStatus === 'Paid'
                              ? 'Đã thanh toán'
                              : 'Chờ thanh toán'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center gap-4">
                        <span className="text-gray-600">Thanh toán phần còn lại</span>
                        <span className={`rounded-full px-3 py-1 text-sm font-bold ${
                          ['PAID', 'PREPARING_DELIVERY', 'DELIVERED', 'COMPLETED'].includes(String(selectedOrder.status))
                            ? 'bg-green-100 text-green-700'
                            : selectedOrder.depositDetails.balancePaymentStatus === 'FAILED'
                              ? 'bg-red-100 text-red-700'
                              : ['CONTRACT_SIGNED', 'PENDING_PAYMENT'].includes(String(selectedOrder.status))
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-gray-100 text-gray-600'
                        }`}>
                          {['PAID', 'PREPARING_DELIVERY', 'DELIVERED', 'COMPLETED'].includes(String(selectedOrder.status))
                            ? 'Đã thanh toán'
                            : selectedOrder.depositDetails.balancePaymentStatus === 'FAILED'
                              ? 'Thanh toán thất bại'
                              : ['CONTRACT_SIGNED', 'PENDING_PAYMENT'].includes(String(selectedOrder.status))
                                ? 'Chờ thanh toán'
                                : 'Chưa đến hạn'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center gap-4">
                        <span className="text-gray-600">Thanh toán toàn bộ đơn xe</span>
                        <span className={`rounded-full px-3 py-1 text-sm font-bold ${
                          ['PAID', 'PREPARING_DELIVERY', 'DELIVERED', 'COMPLETED'].includes(String(selectedOrder.status))
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {['PAID', 'PREPARING_DELIVERY', 'DELIVERED', 'COMPLETED'].includes(String(selectedOrder.status))
                            ? 'Đã thanh toán toàn bộ'
                            : 'Chưa thanh toán toàn bộ'}
                        </span>
                      </div>
                      <div className="border-t border-gray-200 pt-4 flex justify-between items-center">
                        <span className="text-gray-600 font-medium">Số tiền đã cọc</span>
                        <span className="font-bold text-[#836100] text-lg">{formatPrice(selectedOrder.pricing.amountDueNow)}</span>
                      </div>
                    </div>
                  </section>

                  {/* Thông tin khách hàng */}
                  <section>
                    <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 border-l-4 border-[#836100] pl-3">Thông tin khách hàng</h4>
                    <div className="bg-gray-50 rounded-xl p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Họ và tên</p>
                        <p className="font-semibold text-gray-900">{selectedOrder.depositDetails.customerName}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Số điện thoại</p>
                        <p className="font-semibold text-gray-900">{selectedOrder.depositDetails.customerPhone}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-xs text-gray-500 mb-1">CMND/CCCD/MST</p>
                        <p className="font-semibold text-gray-900">{selectedOrder.depositDetails.idCardNumber}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-xs text-gray-500 mb-1">Khu vực</p>
                        <p className="font-semibold text-gray-900">
                          {[selectedOrder.depositDetails.ward, selectedOrder.depositDetails.province].filter(Boolean).join(', ') || 'Chưa cập nhật'}
                        </p>
                      </div>
                    </div>
                  </section>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      <Footer />
    </main>
  )
}

export default function ProfilePage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-gray-50"><Loader2 className="h-8 w-8 animate-spin text-[#836100]" /></main>}><ProfileContent /></Suspense>
}
