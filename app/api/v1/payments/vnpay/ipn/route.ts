import { vnPayParams } from '@/lib/payments/vnpay'
import { processVnPayCallback } from '@/lib/services/vnpay-payment-service'
export const dynamic = 'force-dynamic'
const reply = (RspCode: string, Message: string) => Response.json({ RspCode, Message })
export async function GET(request: Request) {
  if (!process.env.VNPAY_TMN_CODE?.trim() || !process.env.VNPAY_HASH_SECRET?.trim()) {
    return reply('99', 'VNPAY is not configured')
  }
  const url = new URL(request.url)
  const params = vnPayParams(url.searchParams)
  const requestInfo = {
    txnRef: params.vnp_TxnRef || null,
    transactionNo: params.vnp_TransactionNo || null,
    responseCode: params.vnp_ResponseCode || null,
    transactionStatus: params.vnp_TransactionStatus || null,
    forwardedFor: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    userAgent: request.headers.get('user-agent') || null,
  }
  console.info('VNPAY IPN received', requestInfo)
  try {
    const result = await processVnPayCallback(params)
    if (!result.valid) {
      console.warn('VNPAY IPN rejected', { ...requestInfo, reason: result.message })
      if (result.message === 'Không tìm thấy giao dịch.') return reply('01', 'Order not found')
      if (result.message === 'Số tiền VNPAY không khớp.') return reply('04', 'Invalid amount')
      return reply('97', 'Invalid signature')
    }
    console.info('VNPAY IPN processed', {
      ...requestInfo,
      orderNumber: result.orderNumber || null,
      success: result.success,
    })
    return reply('00', 'Confirm Success')
  } catch (error) {
    console.error('Unable to process VNPAY IPN:', { ...requestInfo, error })
    return reply('99', 'Unknown error')
  }
}
