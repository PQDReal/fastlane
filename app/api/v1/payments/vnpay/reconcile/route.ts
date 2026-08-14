import { NextResponse } from 'next/server'
import { ApiRouteError, apiErrorResponse } from '@/lib/api/errors'
import { reconcilePendingVnPayPayments } from '@/lib/services/vnpay-payment-reconciliation-service'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      throw new ApiRouteError(401, 'UNAUTHORIZED', 'Missing or invalid cron authorization token.')
    }
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    const results = await reconcilePendingVnPayPayments({
      clientIp: forwarded || request.headers.get('x-real-ip') || '127.0.0.1',
    })
    return NextResponse.json({
      processedCount: results.length,
      paidCount: results.filter((result) => result.status === 'PAID').length,
      failedCount: results.filter((result) => result.status === 'FAILED').length,
      pendingCount: results.filter((result) => result.status === 'PENDING').length,
      errorCount: results.filter((result) => result.status === 'ERROR').length,
      results,
    })
  } catch (error) {
    console.error('Unable to reconcile pending VNPay payments:', error)
    return apiErrorResponse(error)
  }
}
