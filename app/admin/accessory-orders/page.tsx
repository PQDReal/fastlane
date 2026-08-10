import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { SelectedProductOption, ShippingAddress } from '@/lib/cart/types'
import { readSelectedOptionsSnapshot } from '@/lib/orders/selected-options'
import { AccessoryOrdersClient, type AdminAccessoryOrder } from './accessory-orders-client'

export const dynamic = 'force-dynamic'

type Row = {
  id: string
  order_number: string
  status: AdminAccessoryOrder['status']
  refund_status: AdminAccessoryOrder['refundStatus']
  subtotal: number | string
  discount_amount: number | string
  total_amount: number | string
  shipping_address: (ShippingAddress & { note?: unknown }) | null
  cancellation_reason: string | null
  created_at: string
  customer: { email: string } | { email: string }[] | null
  order_items: Array<{
    id: string
    sku_snapshot: string
    product_name_snapshot: string
    variant_name_snapshot: string
    selected_options_snapshot: unknown
    unit_price: number | string
    quantity: number
    line_subtotal: number | string
  }>
  refund_attempts: Array<{ status: AdminAccessoryOrder['refundAttemptStatus']; requested_at: string; updated_at: string }>
}

function selectedOptions(value: unknown): SelectedProductOption[] {
  try {
    return readSelectedOptionsSnapshot(value)
  } catch {
    return []
  }
}

export default async function AdminAccessoryOrdersPage() {
  const result = await getSupabaseAdmin()
    .from('orders')
    .select('id,order_number,status,refund_status,subtotal,discount_amount,total_amount,shipping_address,cancellation_reason,created_at,customer:users!inner(email),order_items(id,sku_snapshot,product_name_snapshot,variant_name_snapshot,selected_options_snapshot,unit_price,quantity,line_subtotal),refund_attempts:vnpay_refund_attempts(status,requested_at,updated_at)')
    .order('created_at', { ascending: false })

  const orders: AdminAccessoryOrder[] = ((result.data ?? []) as Row[]).map((row) => {
    const latestRefundAttempt = [...(row.refund_attempts ?? [])].sort((a, b) => b.requested_at.localeCompare(a.requested_at))[0]
    const rawAddress = row.shipping_address
    return {
      id: row.id,
      orderNumber: row.order_number,
      customerEmail: (Array.isArray(row.customer) ? row.customer[0] : row.customer)?.email ?? 'Không xác định',
      items: (row.order_items ?? []).map((item) => ({
        id: item.id,
        sku: item.sku_snapshot,
        product_name_snapshot: item.product_name_snapshot,
        variantName: item.variant_name_snapshot,
        selectedOptions: selectedOptions(item.selected_options_snapshot),
        unitPrice: Number(item.unit_price),
        quantity: item.quantity,
        lineSubtotal: Number(item.line_subtotal),
      })),
      subtotal: Number(row.subtotal),
      discountAmount: Number(row.discount_amount),
      totalAmount: Number(row.total_amount),
      shippingAddress: rawAddress ? {
        recipientName: rawAddress.recipientName,
        phoneNumber: rawAddress.phoneNumber,
        line1: rawAddress.line1,
        ...(rawAddress.line2 ? { line2: rawAddress.line2 } : {}),
        communeLevel: rawAddress.communeLevel,
        province: rawAddress.province,
        countryCode: 'VN',
      } : null,
      note: typeof rawAddress?.note === 'string' ? rawAddress.note : null,
      cancellationReason: row.cancellation_reason,
      cancelledBy: row.status !== 'CANCELLED'
        ? null
        : row.cancellation_reason === 'ADMIN_CANCELLED'
          ? 'ADMIN'
          : row.cancellation_reason === 'Khách hàng yêu cầu hủy đơn'
            ? 'CUSTOMER'
            : 'UNKNOWN',
      status: row.status,
      refundStatus: row.refund_status,
      refundAttemptStatus: latestRefundAttempt?.status ?? null,
      refundNextCheckAt: latestRefundAttempt?.updated_at
        ? new Date(new Date(latestRefundAttempt.updated_at).getTime() + 310_000).toISOString()
        : null,
      createdAt: row.created_at,
    }
  })

  return <AccessoryOrdersClient initialOrders={orders} loadError={result.error ? 'Không thể tải dữ liệu đơn phụ kiện từ Supabase.' : null} />
}
