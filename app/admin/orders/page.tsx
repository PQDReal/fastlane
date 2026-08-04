import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { AdminOrdersClient, AdminOrderRow } from './orders-client'

export const dynamic = 'force-dynamic'

export default async function AdminOrdersPage() {
  const supabase = getSupabaseAdmin()
  
  const { data: depositData, error: depositError } = await supabase
    .from('deposit_orders')
    .select('*, vehicle_variants(*)')
    .order('created_at', { ascending: false })

  if (depositError) {
    console.error('Failed to fetch deposit orders:', depositError)
  }

  const orders: AdminOrderRow[] = (depositData ?? []).map((deposit: any) => {
    let paymentStatus = 'Pending'
    if (deposit.status === 'PAID' || deposit.status === 'PREPARING_DELIVERY' || deposit.status === 'DELIVERED' || deposit.status === 'COMPLETED') {
      paymentStatus = 'Paid'
    } else if (deposit.status === 'CANCELLED') {
      paymentStatus = 'Pending'
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
      createdAt: deposit.created_at,
      isCar: true,
      kyc_status: deposit.kyc_status,
      kyc_session_id: deposit.kyc_session_id,
      rawDeposit: deposit,
    }
  })

  return <AdminOrdersClient orders={orders} />
}
