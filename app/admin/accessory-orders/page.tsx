import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { AccessoryOrdersClient, type AdminAccessoryOrder } from './accessory-orders-client'

export const dynamic = 'force-dynamic'

type Row = {
  id: string
  order_number: string
  status: AdminAccessoryOrder['status']
  refund_status: AdminAccessoryOrder['refundStatus']
  total_amount: number | string
  created_at: string
  customer: { email: string } | { email: string }[] | null
  order_items: Array<{ product_name_snapshot: string; quantity: number }>
  refund_attempts: Array<{ status: AdminAccessoryOrder['refundAttemptStatus']; requested_at: string }>
}

export default async function AdminAccessoryOrdersPage() {
  const result = await getSupabaseAdmin()
    .from('orders')
    .select('id,order_number,status,refund_status,total_amount,created_at,customer:users!inner(email),order_items(product_name_snapshot,quantity),refund_attempts:vnpay_refund_attempts(status,requested_at)')
    .order('created_at', { ascending: false })

  const orders: AdminAccessoryOrder[] = ((result.data ?? []) as Row[]).map((row) => ({
    id: row.id,
    orderNumber: row.order_number,
    customerEmail: (Array.isArray(row.customer) ? row.customer[0] : row.customer)?.email ?? 'Không xác định',
    items: row.order_items ?? [],
    totalAmount: Number(row.total_amount),
    status: row.status,
    refundStatus: row.refund_status,
    refundAttemptStatus: [...(row.refund_attempts ?? [])].sort((a, b) => b.requested_at.localeCompare(a.requested_at))[0]?.status ?? null,
    createdAt: row.created_at,
  }))

  return <AccessoryOrdersClient initialOrders={orders} loadError={result.error ? 'Không thể tải dữ liệu đơn phụ kiện từ Supabase.' : null} />
}
