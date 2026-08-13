import { NextResponse } from 'next/server'

import { apiErrorResponse, ApiRouteError } from '@/lib/api/errors'
import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import type { SelectedProductOption, ShippingAddress } from '@/lib/cart/types'
import { parseItemId } from '@/lib/cart/validation'
import type { CancellationActorType, OrderCancellationAudit } from '@/lib/orders/cancellation-audit'
import { readSelectedOptionsSnapshot } from '@/lib/orders/selected-options'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { AdminAccessoryOrder } from '@/app/admin/accessory-orders/accessory-orders-client'

type RouteContext = { params: Promise<{ orderId: string }> }

type DetailRow = {
  id: string
  order_number: string
  status: AdminAccessoryOrder['status']
  refund_status: AdminAccessoryOrder['refundStatus']
  subtotal: number | string
  discount_amount: number | string
  total_amount: number | string
  shipping_address: (ShippingAddress & { note?: unknown }) | null
  cancellation_reason: string | null
  cancelled_at?: string | null
  cancelled_by_type?: CancellationActorType | null
  cancelled_by_user_id?: string | null
  cancellation_reason_code?: string | null
  cancellation_note?: string | null
  cancellation_audit_version?: number | null
  created_at: string
  updated_at: string
  customer: { id: string; email: string } | { id: string; email: string }[] | null
  cancelled_by?: { id: string; email: string } | { id: string; email: string }[] | null
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
  refund_attempts: Array<{
    status: AdminAccessoryOrder['refundAttemptStatus']
    requested_at: string
    updated_at: string
  }>
}

const baseSelection = 'id,order_number,status,refund_status,subtotal,discount_amount,total_amount,shipping_address,cancellation_reason,created_at,updated_at,customer:users!orders_customer_id_fkey!inner(id,email),order_items(id,sku_snapshot,product_name_snapshot,variant_name_snapshot,selected_options_snapshot,unit_price,quantity,line_subtotal),refund_attempts:vnpay_refund_attempts(status,requested_at,updated_at)'
const auditedSelection = `${baseSelection},cancelled_at,cancelled_by_type,cancelled_by_user_id,cancellation_reason_code,cancellation_note,cancellation_audit_version,cancelled_by:users!orders_cancelled_by_user_id_fkey(id,email)`

function selectedOptions(value: unknown): SelectedProductOption[] {
  try {
    return readSelectedOptionsSnapshot(value)
  } catch {
    return []
  }
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null
}

function legacyActor(reason: string | null): CancellationActorType {
  if (reason === 'ADMIN_CANCELLED') return 'ADMIN'
  if (reason === 'Khách hàng yêu cầu hủy đơn') return 'CUSTOMER'
  return 'UNKNOWN'
}

function cancellationAudit(row: DetailRow): OrderCancellationAudit | null {
  if (row.status !== 'CANCELLED') return null

  const customer = firstRelation(row.customer)
  const auditedActor = firstRelation(row.cancelled_by)
  const auditVersion = row.cancellation_audit_version ?? null
  const actorType = row.cancelled_by_type ?? legacyActor(row.cancellation_reason)
  const actorUserId = row.cancelled_by_user_id
    ?? (actorType === 'CUSTOMER' ? customer?.id ?? null : null)
  const actorEmail = auditedActor?.email
    ?? (actorType === 'CUSTOMER' ? customer?.email ?? null : null)
  const reasonCode = row.cancellation_reason_code
    ?? (row.cancellation_reason === 'ADMIN_CANCELLED' ? 'admin_decision' : 'other')
  const legacyNote = row.cancellation_reason === 'ADMIN_CANCELLED'
    ? null
    : row.cancellation_reason

  return {
    actorType,
    actorUserId,
    actorEmail,
    reasonCode,
    note: row.cancellation_note ?? legacyNote,
    cancelledAt: row.cancelled_at ?? row.updated_at,
    auditVersion,
    isLegacy: auditVersion !== 2,
    timeInferred: auditVersion !== 2,
  }
}

function toAdminOrder(row: DetailRow): AdminAccessoryOrder {
  const latestRefundAttempt = [...(row.refund_attempts ?? [])]
    .sort((a, b) => b.requested_at.localeCompare(a.requested_at))[0]
  const rawAddress = row.shipping_address
  const customer = firstRelation(row.customer)

  return {
    id: row.id,
    orderNumber: row.order_number,
    customerEmail: customer?.email ?? 'Không xác định',
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
    cancellation: cancellationAudit(row),
    status: row.status,
    refundStatus: row.refund_status,
    refundAttemptStatus: latestRefundAttempt?.status ?? null,
    refundNextCheckAt: latestRefundAttempt?.updated_at
      ? new Date(new Date(latestRefundAttempt.updated_at).getTime() + 310_000).toISOString()
      : null,
    createdAt: row.created_at,
    detailsLoaded: true,
  }
}

export async function GET(request: Request, context: RouteContext) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    if (error instanceof ApiAuthError) return authErrorResponse(error)
    return apiErrorResponse(error)
  }

  try {
    const { orderId: rawOrderId } = await context.params
    const orderId = parseItemId(rawOrderId)
    const supabase = getSupabaseAdmin()
    const auditedResult = await supabase
      .from('orders')
      .select(auditedSelection)
      .eq('id', orderId)
      .maybeSingle()
    const auditSchemaUnavailable = Boolean(auditedResult.error
      && ['42703', 'PGRST200'].includes(auditedResult.error.code ?? ''))
    const legacyResult = auditSchemaUnavailable
      ? await supabase.from('orders').select(baseSelection).eq('id', orderId).maybeSingle()
      : null
    const result = legacyResult ?? auditedResult

    if (result.error) throw result.error
    if (!result.data) {
      throw new ApiRouteError(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn phụ kiện.')
    }

    return NextResponse.json({ data: toAdminOrder(result.data as unknown as DetailRow) })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
