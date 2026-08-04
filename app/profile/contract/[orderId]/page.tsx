import { notFound, redirect } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getCurrentUser } from '@/lib/auth/current-user'
import ContractPageClient from './contract-client'

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
    .select('*, vehicle_variants(*)')
    .eq('id', orderId)
    .single()

  if (error || !order) {
    notFound()
  }

  if (order.customer_id !== user.id && order.email !== user.email && user.role !== 'ADMIN') {
    redirect('/403')
  }

  const allowedStatuses = [
    'PENDING_CONTRACT', 
    'CONTRACT_SIGNED', 
    'PENDING_PAYMENT', 
    'PAID', 
    'PREPARING_DELIVERY', 
    'DELIVERED', 
    'COMPLETED'
  ]

  if (!allowedStatuses.includes(order.status)) {
    redirect('/profile')
  }

  return <ContractPageClient order={order} />
}
