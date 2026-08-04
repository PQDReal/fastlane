import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getCurrentUser } from '@/lib/auth/current-user'
import { revalidatePath } from 'next/cache'

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { orderId } = body

    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Lấy thông tin order để kiểm tra quyền
    const { data: orderData, error: fetchError } = await supabase
      .from('deposit_orders')
      .select('id, customer_id, email, status')
      .eq('id', orderId)
      .single()

    if (fetchError || !orderData) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (orderData.customer_id !== user.id && orderData.email !== user.email && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Kiểm tra trạng thái có cho phép ký không
    if (orderData.status !== 'PENDING_CONTRACT') {
      return NextResponse.json({ error: 'Đơn hàng không ở trạng thái chờ ký hợp đồng' }, { status: 400 })
    }

    // Cập nhật trạng thái
    const { error: updateError } = await supabase
      .from('deposit_orders')
      .update({
        status: 'CONTRACT_SIGNED',
        contract_signed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)

    if (updateError) {
      console.error('Error signing contract:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    revalidatePath('/profile')
    
    return NextResponse.json({ success: true, redirectUrl: '/profile?tab=car-orders' })
  } catch (error: any) {
    console.error('Error in sign contract API:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
