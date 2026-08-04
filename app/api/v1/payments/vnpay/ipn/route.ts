import { vnPayParams } from '@/lib/payments/vnpay'
import { processVnPayCallback } from '@/lib/services/vnpay-payment-service'
export const dynamic = 'force-dynamic'
const reply = (RspCode: string, Message: string) => Response.json({ RspCode, Message })
export async function GET(request: Request) {
  if (!process.env.VNPAY_TMN_CODE?.trim() || !process.env.VNPAY_HASH_SECRET?.trim()) {
    return reply('99', 'VNPAY is not configured')
  }
  try {
    const result = await processVnPayCallback(vnPayParams(new URL(request.url).searchParams))
    if (!result.valid) {
      if (result.message === 'Không tìm thấy giao dịch.') return reply('01', 'Order not found')
      if (result.message === 'Số tiền VNPAY không khớp.') return reply('04', 'Invalid amount')
      return reply('97', 'Invalid signature')
    }
    return reply('00', 'Confirm Success')
  } catch (error) {
    console.error('Unable to process VNPAY IPN:', error)
    return reply('99', 'Unknown error')
  }
}
