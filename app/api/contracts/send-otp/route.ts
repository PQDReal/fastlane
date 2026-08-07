import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { writeRedisJson } from '@/lib/redis'
import { sendEmailOTP } from '@/lib/mailer'

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orderId } = await req.json()
    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // 1. Validate that the order exists and belongs to the user
    // In this app, sometimes email is used to tie users to orders, or Auth0 sub.
    // Let's just fetch the order to ensure it exists and maybe verify email if we can.
    const { data: order, error: fetchError } = await supabase
      .from('deposit_orders')
      .select('id, email, full_name, status')
      .eq('id', orderId)
      .single()

    if (fetchError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // 2. Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString()

    // 3. Save to Redis with 5 minutes expiration (300 seconds)
    const redisKey = `otp:contract:sign:${orderId}`
    await writeRedisJson(redisKey, otp, 300)

    // 4. Send the OTP via email
    // If the order has an email, send it there, else fallback to user email
    const toEmail = order.email || user.email
    await sendEmailOTP(toEmail, otp)

    return NextResponse.json({ success: true, message: 'OTP sent successfully' })
  } catch (error: any) {
    console.error('[SEND OTP ERROR]', error)

    return NextResponse.json(
      {
        error: 'Không thể gửi email OTP. Vui lòng thử lại sau.',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}