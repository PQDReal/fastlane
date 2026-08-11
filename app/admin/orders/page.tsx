import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { areDepositDebugActionsEnabled } from '@/lib/deposit/debug-mode'
import type { CancellationActorType, OrderCancellationAudit } from '@/lib/orders/cancellation-audit'
import { AdminOrdersClient, AdminOrderRow } from './orders-client'

export const dynamic = 'force-dynamic'

const depositOrderBaseColumns = 'id,order_number,status,customer_type,full_name,phone_number,email,id_card_number,province,ward,vehicle_type,car_model,car_variant,exterior_color,interior_color,deposit_amount,subtotal,discount_amount,total_estimated_price,promotion_code,payment_method,showroom,created_at,vehicle_variants(deposit_amount,product_name,variant_name)'
const depositOrderTrackingColumns = `${depositOrderBaseColumns},refund_status,kyc_status,kyc_session_id,contract_issued_at,contract_signature_due_at,contract_signed_at,vehicle_ready_at,vehicle_ready_notified_at,cancelled_at,cancellation_reason_code,cancellation_note`

type DepositCancellationEvent = {
  id: string
  deposit_order_id: string
  event_type: 'DEPOSIT_CANCELLED' | 'CONTRACT_EXPIRED'
  actor_type: CancellationActorType
  actor_user_id: string | null
  metadata: unknown
  occurred_at: string
}

function metadataText(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const value = (metadata as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : null
}

function inferredDepositActor(reasonCode: string | null | undefined): CancellationActorType {
  if (reasonCode?.startsWith('CUSTOMER_')) return 'CUSTOMER'
  if (reasonCode?.startsWith('ADMIN_')) return 'ADMIN'
  if (reasonCode === 'CONTRACT_SIGNATURE_EXPIRED') return 'SYSTEM'
  return 'UNKNOWN'
}

function databaseErrorDetails(error: any) {
  return {
    code: error?.code ?? null,
    message: error?.message ?? 'Unknown database error',
    details: error?.details ?? null,
    hint: error?.hint ?? null,
  }
}

export default async function AdminOrdersPage() {
  const supabase = getSupabaseAdmin()

  const depositResult = await supabase
    .from('deposit_orders')
    .select(depositOrderTrackingColumns)
    .order('created_at', { ascending: false })
  let depositData: any[] | null = depositResult.data as any[] | null
  let depositError = depositResult.error

  // Keep the order dashboard usable while migration 036 is still pending on an
  // existing Supabase project. KYC/refund data is treated as unavailable only;
  // the order rows themselves must still be displayed.
  if (depositError?.code === '42703') {
    const legacyResult = await supabase
      .from('deposit_orders')
      .select(depositOrderBaseColumns)
      .order('created_at', { ascending: false })

    depositData = legacyResult.data
    depositError = legacyResult.error
  }

  if (depositError) {
    console.error('Failed to fetch deposit orders:', databaseErrorDetails(depositError))
  }

  const paidDepositOrderIds = new Set<string>()
  const cancellationEventByOrder = new Map<string, DepositCancellationEvent>()
  const actorEmailById = new Map<string, string>()
  const depositOrderIds = (depositData ?? []).map((deposit: any) => deposit.id)
  const cancelledDepositOrderIds = (depositData ?? [])
    .filter((deposit: any) => deposit.status === 'CANCELLED')
    .map((deposit: any) => deposit.id)
  if (depositOrderIds.length > 0) {
    const cancellationEventsPromise = cancelledDepositOrderIds.length > 0
      ? supabase
        .from('deposit_order_events')
        .select('id,deposit_order_id,event_type,actor_type,actor_user_id,metadata,occurred_at')
        .in('deposit_order_id', cancelledDepositOrderIds)
        .in('event_type', ['DEPOSIT_CANCELLED', 'CONTRACT_EXPIRED'])
        .order('occurred_at', { ascending: false })
        .order('id', { ascending: false })
      : Promise.resolve({ data: [] as DepositCancellationEvent[], error: null })

    const [paymentAttemptsResult, cancellationEventsResult] = await Promise.all([
      supabase
        .from('vnpay_deposit_attempts')
        .select('deposit_order_id,status')
        .in('deposit_order_id', depositOrderIds)
        .eq('status', 'PAID'),
      cancellationEventsPromise,
    ])

    if (paymentAttemptsResult.error) {
      console.error('Failed to fetch deposit payment attempts:', paymentAttemptsResult.error)
    } else {
      for (const attempt of paymentAttemptsResult.data ?? []) paidDepositOrderIds.add(attempt.deposit_order_id)
    }

    if (cancellationEventsResult.error) {
      console.error('Failed to fetch deposit cancellation events:', cancellationEventsResult.error)
    } else {
      for (const event of (cancellationEventsResult.data ?? []) as DepositCancellationEvent[]) {
        if (!cancellationEventByOrder.has(event.deposit_order_id)) {
          cancellationEventByOrder.set(event.deposit_order_id, event)
        }
      }

      const actorIds = [...new Set(
        [...cancellationEventByOrder.values()]
          .map((event) => event.actor_user_id)
          .filter((value): value is string => Boolean(value)),
      )]
      if (actorIds.length > 0) {
        const actorsResult = await supabase.from('users').select('id,email').in('id', actorIds)
        if (actorsResult.error) {
          console.error('Failed to fetch deposit cancellation actors:', actorsResult.error)
        } else {
          for (const actor of actorsResult.data ?? []) actorEmailById.set(actor.id, actor.email)
        }
      }
    }
  }

  const orders: AdminOrderRow[] = (depositData ?? []).map((deposit: any) => {
    let paymentStatus = 'Pending'
    if (paidDepositOrderIds.has(deposit.id)) {
      paymentStatus = 'Paid'
    }

    const defaultDepositVal = (() => {
      const m = String(deposit.car_model || '').toUpperCase()
      if (m.includes('VF 7') || m.includes('VF 9')) return 50000000
      if (m.includes('VF 6') || m.includes('VF 8')) return 30000000
      if (deposit.vehicle_type === 'motorbike') return 2000000
      return 15000000
    })()

    const amount = deposit.deposit_amount ? Number(deposit.deposit_amount) : (deposit.vehicle_variants?.deposit_amount ? Number(deposit.vehicle_variants.deposit_amount) : defaultDepositVal)

    const pName = deposit.vehicle_variants?.product_name || deposit.car_model || ''
    const vName = deposit.vehicle_variants?.variant_name || deposit.car_variant || ''
    const vehicleName = vName ? (vName.toLowerCase().includes(pName.toLowerCase()) ? vName : `${pName} ${vName}`) : (pName || 'Xe VinFast')
    const cancellationEvent = cancellationEventByOrder.get(deposit.id)
    const reasonCode = metadataText(cancellationEvent?.metadata, 'reasonCode')
      ?? deposit.cancellation_reason_code
      ?? null
    const cancellationAudit: OrderCancellationAudit | null = deposit.status === 'CANCELLED'
      ? {
        actorType: cancellationEvent?.actor_type ?? inferredDepositActor(reasonCode),
        actorUserId: cancellationEvent?.actor_user_id ?? null,
        actorEmail: cancellationEvent?.actor_user_id
          ? actorEmailById.get(cancellationEvent.actor_user_id) ?? null
          : null,
        reasonCode,
        note: metadataText(cancellationEvent?.metadata, 'note')
          ?? deposit.cancellation_note
          ?? null,
        cancelledAt: cancellationEvent?.occurred_at
          ?? deposit.cancelled_at
          ?? null,
        auditVersion: cancellationEvent ? 2 : null,
        isLegacy: !cancellationEvent,
        timeInferred: !cancellationEvent && !deposit.cancelled_at,
      }
      : null

    return {
      id: deposit.id,
      orderNumber: deposit.order_number || deposit.id,
      customerName: deposit.full_name || 'Khách hàng',
      vehicle: vehicleName,
      vehicleType: deposit.vehicle_type || 'car',
      amount,
      status: deposit.status,
      payment: paymentStatus,
      refundStatus: deposit.refund_status || 'NONE',
      createdAt: deposit.created_at,
      isCar: true,
      kyc_status: deposit.kyc_status,
      kyc_session_id: deposit.kyc_session_id,
      cancellationAudit,
      rawDeposit: deposit,
    }
  })

  return <AdminOrdersClient
    orders={orders}
    debugActionsEnabled={areDepositDebugActionsEnabled()}
  />
}
