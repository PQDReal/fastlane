import { notFound, redirect } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getCurrentUser } from '@/lib/auth/current-user'
import ContractPageClient from './contract-client'

export const dynamic = 'force-dynamic'

export default async function ContractPage({ params }: { params: { orderId: string } }) {
  const user = await getCurrentUser()
  if (!user) {
    redirect('/auth/login')
  }

  const supabase = getSupabaseAdmin()
  const { data: order, error } = await supabase
    .from('deposit_orders')
    .select('*, vehicle_variants(*)')
    .eq('id', params.orderId)
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

  return <ContractPageClient order={order} />
}
