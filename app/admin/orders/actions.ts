'use server'

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { revalidatePath } from 'next/cache'

export async function updateOrderStatus(orderId: string, newStatus: string) {
  const supabase = getSupabaseAdmin()

  try {
    const { error } = await supabase
      .from('deposit_orders')
      .update({ 
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)

    if (error) {
      console.error('Error updating order status:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/admin/orders')
    return { success: true }
  } catch (err: any) {
    console.error('Exception updating order status:', err)
    return { success: false, error: err.message }
  }
}
