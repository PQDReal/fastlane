import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { AccessoryOrdersClient, type AdminAccessoryOrder } from './accessory-orders-client'

export const dynamic = 'force-dynamic'

type SummaryRow = {
  id: string
  order_number: string
  status: AdminAccessoryOrder['status']
  refund_status: AdminAccessoryOrder['refundStatus']
  total_amount: number | string
  created_at: string
  customer: { id: string; email: string } | { id: string; email: string }[] | null
  order_items: Array<{
    id: string
    product_name_snapshot: string
    quantity: number
  }>
  payment_attempts: Array<{
    status: AdminAccessoryOrder['paymentAttemptStatus']
    created_at: string
  }>
  refund_attempts: Array<{
    status: AdminAccessoryOrder['refundAttemptStatus']
    requested_at: string
    updated_at: string
  }>
}

const summarySelection = 'id,order_number,status,refund_status,total_amount,created_at,customer:users!orders_customer_id_fkey!inner(id,email),order_items(id,product_name_snapshot,quantity),payment_attempts:vnpay_checkout_attempts(status,created_at),refund_attempts:vnpay_refund_attempts(status,requested_at,updated_at)'

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null
}

export default async function AdminAccessoryOrdersPage() {
  const result = await getSupabaseAdmin()
    .from('orders')
    .select(summarySelection)
    .order('created_at', { ascending: false })

  const orders: AdminAccessoryOrder[] = ((result.data ?? []) as unknown as SummaryRow[]).map((row) => {
    const latestPaymentAttempt = [...(row.payment_attempts ?? [])]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    const latestRefundAttempt = [...(row.refund_attempts ?? [])]
      .sort((a, b) => b.requested_at.localeCompare(a.requested_at))[0]
    const customer = firstRelation(row.customer)

    return {
      id: row.id,
      orderNumber: row.order_number,
      customerEmail: customer?.email ?? 'Không xác định',
      items: (row.order_items ?? []).map((item) => ({
        id: item.id,
        product_name_snapshot: item.product_name_snapshot,
        quantity: item.quantity,
      })),
      totalAmount: Number(row.total_amount),
      status: row.status,
      refundStatus: row.refund_status,
      paymentAttemptStatus: latestPaymentAttempt?.status ?? null,
      refundAttemptStatus: latestRefundAttempt?.status ?? null,
      refundNextCheckAt: latestRefundAttempt?.updated_at
        ? new Date(new Date(latestRefundAttempt.updated_at).getTime() + 310_000).toISOString()
        : null,
      createdAt: row.created_at,
      detailsLoaded: false,
    }
  })

  return <AccessoryOrdersClient
    initialOrders={orders}
    loadError={result.error ? 'Không thể tải dữ liệu đơn phụ kiện từ Supabase.' : null}
  />
}
