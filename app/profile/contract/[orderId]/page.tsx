import { notFound, redirect } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getCurrentUser } from '@/lib/auth/current-user'
import ContractPageClient from './contract-client'
import { getDepositContractMode } from '@/lib/deposit/contract-workflow'

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
    .select('id,order_number,status,customer_id,email,full_name,id_card_number,phone_number,province,ward,vehicle_type,car_model,car_variant,exterior_color,total_estimated_price,deposit_amount,created_at,vehicle_variants(product_name,variant_name,deposit_amount)')
    .eq('id', orderId)
    .single()

  if (error || !order) {
    notFound()
  }

  if (order.customer_id !== user.id && order.email !== user.email && user.role !== 'ADMIN') {
    redirect('/403')
  }

  if (order.status !== 'PENDING_CONTRACT' && order.status !== 'CONTRACT_SIGNED') {
    redirect('/profile')
  }

  return <ContractPageClient order={{ ...order, contractMode: getDepositContractMode(order) }} />
}
