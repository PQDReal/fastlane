import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { areDepositDebugActionsEnabled } from '@/lib/deposit/debug-mode'
import { AdminOrdersClient, AdminOrderRow } from './orders-client'

export const dynamic = 'force-dynamic'

const depositOrderBaseColumns = 'id,order_number,status,customer_type,full_name,phone_number,email,id_card_number,province,ward,vehicle_type,car_model,car_variant,exterior_color,interior_color,deposit_amount,subtotal,discount_amount,total_estimated_price,promotion_code,payment_method,showroom,created_at,vehicle_variants(deposit_amount,product_name,variant_name)'
const depositOrderTrackingColumns = `${depositOrderBaseColumns},refund_status,kyc_status,kyc_session_id,contract_issued_at,contract_signature_due_at,contract_signed_at,vehicle_ready_at,vehicle_ready_notified_at`

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
  const latestRefundAttemptByOrder = new Map<string, {
    status: AdminOrderRow['refundAttemptStatus']
    updated_at: string
  }>()
  const depositOrderIds = (depositData ?? []).map((deposit: any) => deposit.id)
  if (depositOrderIds.length > 0) {
    const [paymentAttemptsResult, refundAttemptsResult] = await Promise.all([
      supabase.from('vnpay_deposit_attempts')
        .select('deposit_order_id,status')
        .in('deposit_order_id', depositOrderIds)
        .eq('status', 'PAID'),
      supabase.from('vnpay_deposit_refund_attempts')
        .select('deposit_order_id,status,created_at,updated_at')
        .in('deposit_order_id', depositOrderIds)
        .order('created_at', { ascending: false }),
    ])

    if (paymentAttemptsResult.error) {
      console.error('Failed to fetch deposit payment attempts:', paymentAttemptsResult.error)
    } else {
      for (const attempt of paymentAttemptsResult.data ?? []) paidDepositOrderIds.add(attempt.deposit_order_id)
    }
    if (refundAttemptsResult.error) {
      console.warn('Deposit refund tracking is unavailable:', databaseErrorDetails(refundAttemptsResult.error))
    } else {
      for (const attempt of refundAttemptsResult.data ?? []) {
        if (!latestRefundAttemptByOrder.has(attempt.deposit_order_id)) {
          latestRefundAttemptByOrder.set(attempt.deposit_order_id, {
            status: attempt.status as AdminOrderRow['refundAttemptStatus'],
            updated_at: attempt.updated_at,
          })
        }
      }
    }
  }

  const orders: AdminOrderRow[] = (depositData ?? []).map((deposit: any) => {
    const refundAttempt = latestRefundAttemptByOrder.get(deposit.id)
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
      refundAttemptStatus: refundAttempt?.status ?? null,
      refundNextCheckAt: refundAttempt?.updated_at
        ? new Date(new Date(refundAttempt.updated_at).getTime() + 310_000).toISOString()
        : null,
      createdAt: deposit.created_at,
      isCar: true,
      kyc_status: deposit.kyc_status,
      kyc_session_id: deposit.kyc_session_id,
      rawDeposit: deposit,
    }
  })

  return <AdminOrdersClient
    orders={orders}
    debugActionsEnabled={areDepositDebugActionsEnabled()}
  />
}
