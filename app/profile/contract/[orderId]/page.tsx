import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getCurrentUser } from '@/lib/auth/current-user'
import ContractPageClient from './contract-client'
import { getDepositContractMode, getDepositDocumentAccess } from '@/lib/deposit/contract-workflow'
import { isSameDepositOwnerEmail } from '@/lib/deposit/order-ownership'

export const dynamic = 'force-dynamic'

export default async function ContractPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  const user = await getCurrentUser()
  if (!user) {
    redirect('/auth/login')
  }

  const supabase = getSupabaseAdmin()
  const { data: order, error } = await supabase
    .from('deposit_orders')
    .select('id,order_number,status,customer_id,email,full_name,id_card_number,phone_number,province,ward,vehicle_type,car_model,car_variant,exterior_color,subtotal,discount_amount,total_estimated_price,promotion_code,deposit_amount,created_at,contract_issued_at,contract_signature_due_at,contract_signed_at,vehicle_variants(product_name,variant_name,deposit_amount)')
    .eq('id', orderId)
    .maybeSingle()

  if (error) throw error
  if (!order) notFound()

  if (order.customer_id !== user.id && !isSameDepositOwnerEmail(order.email, user.email) && user.role !== 'ADMIN') {
    redirect('/403')
  }

  const { data: document, error: documentError } = await supabase
    .from('deposit_order_documents')
    .select('id,status,content_snapshot,content_hash,issued_at,signature_due_at,signed_at')
    .eq('deposit_order_id', orderId)
    .in('status', ['PENDING_SIGNATURE', 'SIGNED'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (documentError) throw documentError

  const contractMode = getDepositContractMode(order)
  if (!document) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
        <section className="w-full max-w-xl rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Tài liệu đặt mua chưa sẵn sàng</h1>
          <p className="mt-3 text-slate-600">
            Đơn {order.order_number} chưa có {contractMode === 'CAR_SALES' ? 'hợp đồng mua xe' : 'thỏa thuận đặt mua'} hợp lệ để hiển thị.
            FastLane cần kiểm tra và phát hành lại tài liệu trước khi bạn có thể xác nhận.
          </p>
          <Link
            href={`/profile?tab=car-orders&orderId=${encodeURIComponent(order.id)}`}
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-5 font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            Quay lại lịch sử mua xe
          </Link>
        </section>
      </main>
    )
  }

  const documentAccess = getDepositDocumentAccess(order.status, document.status)
  const canSign = documentAccess === 'SIGN'
  if (documentAccess === 'NONE') redirect('/profile?tab=car-orders')

  return <ContractPageClient order={{
    ...order,
    contractMode,
    contractDocumentId: document.id,
    contractDocumentStatus: document.status,
    contractDocumentSignedAt: document.signed_at,
    contractContentHash: document.content_hash,
    contractSnapshot: document.content_snapshot,
    canSign,
  }} />
}
