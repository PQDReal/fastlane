import Link from 'next/link'
import { vnPayParams } from '@/lib/payments/vnpay'
import { processVnPayCallback } from '@/lib/services/vnpay-payment-service'

export const dynamic = 'force-dynamic'

export default async function VnPayReturnPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const values = await searchParams
  const query = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (typeof value === 'string') query.set(key, value)
    else value?.forEach((item) => query.append(key, item))
  })
  let result
  try {
    result = await processVnPayCallback(vnPayParams(query))
  } catch (error) {
    console.error('Unable to process VNPAY return:', error)
    result = { success: false, message: 'Chưa thể xác nhận giao dịch.' }
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <section className="w-full max-w-lg rounded-3xl bg-white p-8 text-center">
        <h1 className="text-2xl font-bold">{result.success ? 'Thanh toán thành công' : 'Thanh toán chưa thành công'}</h1>
        <p className="mt-3 text-slate-600">{result.message}</p>
        {result.orderNumber && <p className="mt-4">Mã đơn hàng: <strong>{result.orderNumber}</strong></p>}
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href={result.success && result.orderId
              ? `/checkout/success?orderId=${encodeURIComponent(result.orderId)}`
              : '/profile?tab=orders'}
            className="rounded-xl bg-slate-950 px-5 py-3 text-white"
          >
            {result.success ? 'Xem đơn hàng' : 'Thử thanh toán lại'}
          </Link>
          <Link href="/" className="rounded-xl border px-5 py-3">Về trang chủ</Link>
        </div>
      </section>
    </main>
  )
}
