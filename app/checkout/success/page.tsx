import { CheckCircle2, Package } from 'lucide-react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { Footer } from '@/components/footer'
import { Header } from '@/components/header'
import { ProductOptionSummary } from '@/components/product-option-summary'
import { getCurrentUser } from '@/lib/auth/current-user'
import { readCustomerOrder } from '@/lib/orders/server'

const formatPrice = (price: string) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Number(price))

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login?returnTo=/checkout')

  const { orderId } = await searchParams
  if (!orderId) notFound()

  let order
  try {
    order = await readCustomerOrder(user.id, orderId)
  } catch {
    notFound()
  }

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col pt-[74px]">
      <Header />
      <div className="flex-1 mx-auto w-full max-w-3xl px-5 py-14">
        <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-16 w-16 text-green-500" />
            <h1 className="mt-5 text-3xl font-bold text-slate-900">Đặt hàng thành công</h1>
            <p className="mt-3 text-slate-500">Mã đơn hàng của bạn là <strong className="text-slate-900">{order.orderNumber}</strong>.</p>
          </div>

          <div className="mt-9 rounded-2xl bg-slate-50 p-5">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Trạng thái</p>
                <p className="mt-1 font-bold text-[#836100]">{order.status}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-slate-500">Tổng tiền</p>
                <p className="mt-1 text-lg font-bold text-[#836100]">{formatPrice(order.pricing.grandTotal)}</p>
              </div>
            </div>

            <ul className="mt-5 space-y-4">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white">
                    <Package className="h-6 w-6 text-slate-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{item.productName}</p>
                    <ProductOptionSummary
                      options={item.selectedOptions}
                      className="mt-1"
                    />
                    <p className="text-xs text-slate-500">{item.sku} · SL {item.quantity}</p>
                  </div>
                  <p className="font-semibold text-slate-700">{formatPrice(item.lineTotal)}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/profile?tab=orders" className="rounded-full bg-[#836100] px-6 py-3 text-center font-semibold text-white hover:bg-[#6a4e00]">Xem lịch sử đơn hàng</Link>
            <Link href="/accessories" className="rounded-full border border-slate-300 px-6 py-3 text-center font-semibold text-slate-700 hover:bg-slate-50">Tiếp tục mua sắm</Link>
          </div>
        </div>
      </div>
      <Footer />
    </main>
  )
}
