import 'server-only'

import { ApiRouteError } from '@/lib/api/errors'
import type {
  AccessoryOrder,
  AccessoryOrderSummary,
  ShippingAddress,
} from '@/lib/cart/types'
import { readSelectedOptionsSnapshot } from '@/lib/orders/selected-options'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type OrderItemRow = {
  id: string
  variant_id: string
  sku_snapshot: string
  product_name_snapshot: string
  variant_name_snapshot: string
  selected_options_snapshot: unknown
  unit_price: number | string
  quantity: number
  line_subtotal: number | string
}

type OrderRow = {
  id: string
  order_number: string
  status: 'PENDING' | 'CONFIRMED' | 'READY' | 'DELIVERED' | 'CANCELLED'
  subtotal: number | string
  discount_amount: number | string
  total_amount: number | string
  shipping_address: ShippingAddress
  created_at: string
  updated_at: string
  customer: { id: string; email: string }
  order_items: OrderItemRow[]
}

function money(value: number | string) {
  return String(Math.round(Number(value)))
}

function orderStatus(status: OrderRow['status']): AccessoryOrder['status'] {
  switch (status) {
    case 'CONFIRMED':
      return 'Paid'
    case 'READY':
      return 'Shipped'
    case 'DELIVERED':
      return 'Completed'
    case 'CANCELLED':
      return 'Cancelled'
    default:
      return 'Created'
  }
}

function mapOrder(row: OrderRow): AccessoryOrder {
  const subtotal = money(row.subtotal)
  const discount = money(row.discount_amount)
  const total = money(row.total_amount)

  const rawAddress = row.shipping_address as ShippingAddress & { note?: unknown }
  const shippingAddress: ShippingAddress = {
    recipientName: rawAddress.recipientName,
    phoneNumber: rawAddress.phoneNumber,
    line1: rawAddress.line1,
    ...(rawAddress.line2 ? { line2: rawAddress.line2 } : {}),
    communeLevel: rawAddress.communeLevel,
    province: rawAddress.province,
    countryCode: 'VN',
  }
  const status = orderStatus(row.status)
  const pending = row.status === 'PENDING'
  const initialPaymentDueAt = new Date(
    new Date(row.created_at).getTime() + 30 * 60 * 1000,
  ).toISOString()
  const cancellationPolicy: AccessoryOrder['cancellationPolicy'] = {
    customerCancellationAllowed: true,
    customerCancellationCutoff: 'before_shipping',
    refundPercentage: 100,
    overdueRefundPercentage: 100,
    cancellationFeeAmount: '0',
  }

  return {
    id: row.id,
    orderNumber: row.order_number,
    customer: row.customer,
    status,
    statusUpdatedAt: row.updated_at,
    pricing: {
      currency: 'VND',
      subtotal,
      discountTotal: discount,
      shippingTotal: '0',
      grandTotal: total,
      amountDueNow: total,
      balanceDue: '0',
    },
    promotion: null,
    payment: {
      status: pending ? 'Pending' : 'Paid',
      amountDueAtCheckout: total,
      amountPaid: pending ? '0' : total,
      amountRefunded: '0',
      balanceDue: pending ? total : '0',
      schedule: {
        initialPaymentDueAt,
        balanceDueAt: null,
        gracePeriodEndsAt: null,
      },
      refund: {
        status: 'NotRequired',
        requestedAmount: '0',
        refundedAmount: '0',
        cancellationFeeAmount: '0',
      },
      transactions: [],
    },
    cancellationPolicy,
    cancellation: null,
    shippingAddress,
    note: typeof rawAddress.note === 'string' ? rawAddress.note : null,
    items: (row.order_items || []).map((item) => ({
      id: item.id,
      variantId: item.variant_id,
      productKind: 'accessory',
      purchaseTerms: {
        paymentMode: 'full',
        depositAmount: null,
        initialPaymentWindowMinutes: 30,
        balancePaymentWindowDays: null,
        gracePeriodHours: null,
        cancellationPolicy,
      },
      sku: item.sku_snapshot,
      productName: item.product_name_snapshot,
      variantAttributes:
        item.variant_name_snapshot === 'Mặc định'
          ? ({} as Record<string, string>)
          : { name: item.variant_name_snapshot },
      selectedOptions: readSelectedOptionsSnapshot(
        item.selected_options_snapshot,
      ),
      unitListPrice: money(item.unit_price),
      unitSalePrice: null,
      unitOptionTotal: '0',
      unitPrice: money(item.unit_price),
      unitAmountDueNow: money(item.unit_price),
      quantity: item.quantity,
      lineTotal: money(item.line_subtotal),
      lineAmountDueNow: money(item.line_subtotal),
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const orderSelection = `
  id,
  order_number,
  status,
  subtotal,
  discount_amount,
  total_amount,
  shipping_address,
  created_at,
  updated_at,
  customer:users!inner(id, email),
  order_items(
    id,
    variant_id,
    sku_snapshot,
    product_name_snapshot,
    variant_name_snapshot,
    selected_options_snapshot,
    unit_price,
    quantity,
    line_subtotal
  )
`

export async function readCustomerOrder(customerId: string, orderId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('orders')
    .select(orderSelection)
    .eq('id', orderId)
    .eq('customer_id', customerId)
    .maybeSingle()

  if (error) throw new Error(`Unable to read order: ${error.message}`)
  if (!data) {
    throw new ApiRouteError(404, 'RESOURCE_NOT_FOUND', 'Order was not found.')
  }

  return mapOrder(data as unknown as OrderRow)
}

export async function listCustomerOrders(
  customerId: string,
  page: number,
  limit: number,
) {
  const start = (page - 1) * limit
  const end = start + limit - 1
  const { data, error, count } = await getSupabaseAdmin()
    .from('orders')
    .select(orderSelection, { count: 'exact' })
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .range(start, end)

  if (error) throw new Error(`Unable to list orders: ${error.message}`)

  const total = count ?? 0
  const orders = ((data ?? []) as unknown as OrderRow[]).map(mapOrder)
  const summaries: AccessoryOrderSummary[] = orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.payment.status,
    nextPaymentDueAt:
      order.payment.status === 'Pending'
        ? order.payment.schedule.initialPaymentDueAt
        : null,
    pricing: {
      currency: 'VND',
      grandTotal: order.pricing.grandTotal,
      amountDueNow: order.pricing.amountDueNow,
      balanceDue: order.pricing.balanceDue,
    },
    createdAt: order.createdAt,
    statusUpdatedAt: order.statusUpdatedAt,
  }))

  return {
    data: summaries,
    meta: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  }
}
