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
  variant: {
    product: OrderItemProduct | OrderItemProduct[] | null
  } | { product: OrderItemProduct | OrderItemProduct[] | null }[] | null
}

type OrderItemProduct = {
  thumbnail_url: string | null
  image_urls: unknown
  media: Array<{
    variant_id: string | null
    role: string
    media_type: string
    url: string
    is_active: boolean
    display_order: number
  }>
}

type OrderRow = {
  id: string
  order_number: string
  status: 'PENDING' | 'PAID' | 'CONFIRMED' | 'READY' | 'DELIVERED' | 'CANCELLED'
  refund_status: 'NONE' | 'PENDING' | 'COMPLETED' | null
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
    case 'PAID':
      return 'Paid'
    case 'CONFIRMED':
      return 'Confirmed'
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
  const pending = row.status === 'PENDING' || (row.status === 'CANCELLED' && row.refund_status !== 'PENDING' && row.refund_status !== 'COMPLETED')
  const refundStatus: AccessoryOrder['refundStatus'] = row.refund_status === 'PENDING'
    ? 'Pending'
    : row.refund_status === 'COMPLETED'
      ? 'Completed'
      : 'None'
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
    refundStatus,
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
    items: (row.order_items || []).map((item) => {
      const variant = Array.isArray(item.variant) ? item.variant[0] : item.variant
      const product = Array.isArray(variant?.product) ? variant.product[0] : variant?.product
      const media = (product?.media ?? [])
        .filter((entry) => entry.is_active && entry.media_type === 'IMAGE')
        .sort((left, right) => left.display_order - right.display_order)
      const thumbnailUrl = media.find((entry) => entry.variant_id === item.variant_id && entry.role === 'THUMBNAIL')?.url
        ?? media.find((entry) => entry.variant_id === null && entry.role === 'THUMBNAIL')?.url
        ?? media.find((entry) => entry.variant_id === item.variant_id)?.url
        ?? (Array.isArray(product?.image_urls) && typeof product.image_urls[0] === 'string' ? product.image_urls[0] : null)
        ?? product?.thumbnail_url
        ?? null
      return {
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
      thumbnailUrl,
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
    }}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const orderSelection = `
  id,
  order_number,
  status,
  refund_status,
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
    ,variant:product_variants(
      product:products(
        thumbnail_url,
        image_urls,
        media:product_media(variant_id,role,media_type,url,is_active,display_order)
      )
    )
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

  const order = mapOrder(data as unknown as OrderRow)
  const attempt = await getSupabaseAdmin()
    .from('vnpay_checkout_attempts')
    .select('status')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ status: 'PENDING' | 'PAID' | 'FAILED' }>()

  if (attempt.error) throw new Error(`Unable to read payment attempt: ${attempt.error.message}`)
  return { ...order, latestPaymentAttemptStatus: attempt.data?.status ?? null }
}

export async function listCustomerOrders(
  customerId: string,
  customerEmail: string,
  page: number,
  limit: number,
  type?: 'accessory' | 'car'
) {
  const supabase = getSupabaseAdmin()

  let accessorySummaries: AccessoryOrderSummary[] = []
  let depositSummaries: AccessoryOrderSummary[] = []

  if (!type || type === 'accessory') {
    const { data: accessoryData, error: accessoryError } = await supabase
      .from('orders')
      .select(orderSelection)
      .eq('customer_id', customerId)
  
    if (accessoryError) throw new Error(`Unable to list orders: ${accessoryError.message}`)
  
    const accessoryOrders = ((accessoryData ?? []) as unknown as OrderRow[]).map(mapOrder)
    const orderIds = accessoryOrders.map((order) => order.id)
    const latestAttemptByOrder = new Map<string, 'PENDING' | 'PAID' | 'FAILED'>()

    if (orderIds.length > 0) {
      const { data: attempts, error: attemptsError } = await supabase
        .from('vnpay_checkout_attempts')
        .select('order_id,status,created_at')
        .in('order_id', orderIds)
        .order('created_at', { ascending: false })

      if (attemptsError) throw new Error(`Unable to list payment attempts: ${attemptsError.message}`)
      for (const attempt of attempts ?? []) {
        if (!latestAttemptByOrder.has(attempt.order_id)) {
          latestAttemptByOrder.set(attempt.order_id, attempt.status as 'PENDING' | 'PAID' | 'FAILED')
        }
      }
    }
    
    accessorySummaries = accessoryOrders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      orderType: 'accessory',
      status: order.status as AccessoryOrderSummary['status'],
      refundStatus: order.refundStatus,
      paymentStatus: order.payment.status,
      latestPaymentAttemptStatus: latestAttemptByOrder.get(order.id) ?? null,
      items: order.items.map((item) => ({
        id: item.id,
        productName: item.productName,
        thumbnailUrl: item.thumbnailUrl,
        quantity: item.quantity,
      })),
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
  }

  if (!type || type === 'car') {
    const { data: depositData, error: depositError } = await supabase
      .from('deposit_orders')
      .select('id,order_number,status,deposit_amount,total_estimated_price,created_at,updated_at,showroom,exterior_color,interior_color,optional_packages,full_name,phone_number,id_card_number,province,ward,customer_type,vehicle_type,car_model,car_variant,vehicle_variants(deposit_amount,product_name,variant_name)')
      .or(`customer_id.eq.${customerId},email.eq.${customerEmail}`)
  
    if (depositError) throw new Error(`Unable to list deposit orders: ${depositError.message}`)
  
    depositSummaries = (depositData ?? []).map((deposit: any) => {
      let paymentStatus: 'Pending' | 'Paid' = 'Pending'
      let orderStatus: AccessoryOrder['status'] = 'Created'
      
      if (deposit.status === 'PAID') {
        paymentStatus = 'Paid'
      } else if (deposit.status === 'CANCELLED') {
        paymentStatus = 'Pending' // Or keep it what it was
      }

      orderStatus = deposit.status; // Pass through the status directly for the UI to handle
      
      const defaultDepositVal = (() => {
        const m = String(deposit.car_model || '').toUpperCase()
        if (m.includes('VF 7') || m.includes('VF 9')) return '50000000'
        if (m.includes('VF 6') || m.includes('VF 8')) return '30000000'
        if (deposit.vehicle_type === 'motorbike') return '2000000'
        return '15000000'
      })()

      const finalDepositVal = deposit.deposit_amount ? String(deposit.deposit_amount) : (deposit.vehicle_variants?.deposit_amount ? String(deposit.vehicle_variants.deposit_amount) : defaultDepositVal)

      return {
        id: deposit.id,
        orderNumber: deposit.order_number,
        orderType: 'deposit',
        carModel: deposit.car_model,
        carVariant: deposit.car_variant,
        status: orderStatus as AccessoryOrderSummary['status'],
        refundStatus: 'None',
        paymentStatus: paymentStatus as 'Pending' | 'Paid',
        nextPaymentDueAt: null,
        pricing: {
          currency: 'VND',
          grandTotal: deposit.total_estimated_price ? String(deposit.total_estimated_price) : finalDepositVal,
          amountDueNow: finalDepositVal,
          balanceDue: deposit.total_estimated_price ? String(Math.max(0, Number(deposit.total_estimated_price) - Number(finalDepositVal))) : '0',
        },
        createdAt: deposit.created_at,
        statusUpdatedAt: deposit.updated_at,
        depositDetails: {
          showroom: deposit.showroom,
          exteriorColor: deposit.exterior_color,
          interiorColor: deposit.interior_color,
          optionalPackages: deposit.optional_packages || [],
          customerName: deposit.full_name,
          customerPhone: deposit.phone_number,
          idCardNumber: deposit.id_card_number,
          province: deposit.province,
          district: deposit.ward,
          customerType: deposit.customer_type,
          totalEstimatedPrice: deposit.total_estimated_price,
          vehicleVariant: deposit.vehicle_variants
        }
      }
    })
  }

  // Combine and sort by createdAt descending
  const combined = [...accessorySummaries, ...depositSummaries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  const total = combined.length
  const start = (page - 1) * limit
  const end = start + limit
  const paginatedData = combined.slice(start, end)

  return {
    data: paginatedData,
    meta: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  }
}
