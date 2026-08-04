'use server'

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { getCurrentUser } from '@/lib/auth/current-user'
import { refundCancelledDepositOrder } from '@/lib/services/vnpay-refund-service'

async function requireAdmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'ADMIN') throw new Error('Bạn không có quyền thực hiện thao tác này.')
  return user
}

export async function updateOrderStatus(orderId: string, newStatus: string) {
  await requireAdmin()
  const supabase = getSupabaseAdmin()

  try {
    if (newStatus === 'CANCELLED') {
      const current = await supabase.from('deposit_orders')
        .select('status')
        .eq('id', orderId)
        .maybeSingle<{ status: string }>()
      if (current.error) throw current.error
      if (!current.data) return { success: false, error: 'Không tìm thấy đơn hàng.' }
      if (['PAID', 'PREPARING_DELIVERY', 'DELIVERED', 'COMPLETED'].includes(current.data.status)) {
        return {
          success: false,
          error: 'Không thể hủy đơn đã thanh toán toàn bộ hoặc đã bước vào quy trình giao xe.',
        }
      }
    }

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

export async function confirmDepositRefund(orderId: string) {
  try {
    const admin = await requireAdmin()
    const requestHeaders = await headers()
    const clientIp = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
      || requestHeaders.get('x-real-ip')
      || '127.0.0.1'
    const result = await refundCancelledDepositOrder({
      orderId,
      requestedBy: admin.email,
      clientIp,
    })
    revalidatePath('/admin/orders')
    revalidatePath('/profile')
    return { success: true, ...result }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Không thể gửi yêu cầu hoàn tiền VNPay.' }
  }
}
