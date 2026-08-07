import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getCurrentUser } from '@/lib/auth/current-user'
import { revalidatePath } from 'next/cache'
import { readRedisJson, deleteRedisKey } from '@/lib/redis'

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { orderId, otp } = body

    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
    }

    if (!otp) {
      return NextResponse.json({ error: 'Thiếu mã xác thực OTP' }, { status: 400 })
    }

    // Verify OTP
    const redisKey = `otp:contract:sign:${orderId}`
    const storedOtp = await readRedisJson<string>(redisKey)

    // Fallback cho môi trường dev khi không cài Redis local
    if (process.env.NODE_ENV === 'development' && !storedOtp) {
      console.warn('[DEV] Redis is down or key not found. Bypassing OTP check.')
    } else {
      if (!storedOtp) {
        return NextResponse.json({ error: 'Mã OTP đã hết hạn hoặc không hợp lệ. Vui lòng gửi lại mã.' }, { status: 400 })
      }

      if (storedOtp !== otp) {
        return NextResponse.json({ error: 'Mã OTP không chính xác.' }, { status: 400 })
      }
    }
    
    await deleteRedisKey(redisKey)

    const supabase = getSupabaseAdmin()

    // Lấy thông tin order để kiểm tra quyền
    const { data: orderData, error: fetchError } = await supabase
      .from('deposit_orders')
      .select('id, customer_id, email, status, order_number, full_name, deposit_amount, total_estimated_price, car_model, car_variant')
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

    // Gửi email thông báo hợp đồng
    try {
      const { sendContractSignedEmail } = await import('@/lib/mailer')
      
      const now = new Date()
      const contractDate = now.toLocaleDateString('vi-VN') + ' ' + now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      
      const formatter = new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
      })
      
      const amount = orderData.deposit_amount ? formatter.format(Number(orderData.deposit_amount)) : 'Liên hệ'
      const remainNum = (Number(orderData.total_estimated_price) || 0) - (Number(orderData.deposit_amount) || 0)
      const remainingAmount = remainNum > 0 ? formatter.format(remainNum) : '0 ₫'
      
      const productName = [orderData.car_model, orderData.car_variant].filter(Boolean).join(' - ') || 'Sản phẩm VinFast'
      const orderNumber = orderData.order_number || orderData.id.substring(0, 8).toUpperCase()
      
      const toEmail = orderData.email || user.email;
      
      await sendContractSignedEmail(
        toEmail,
        orderData.full_name || 'Quý khách',
        orderNumber,
        contractDate,
        productName,
        amount,
        remainingAmount,
        orderId
      )
    } catch (e) {
      console.error('Lỗi khi gửi mail hợp đồng:', e)
      // Không ném lỗi ra ngoài để luồng ký hợp đồng vẫn thành công
    }

    revalidatePath('/profile')
    
    return NextResponse.json({ success: true, redirectUrl: '/profile?tab=car-orders' })
  } catch (error: any) {
    console.error('Error in sign contract API:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
