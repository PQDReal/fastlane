import { NextResponse } from 'next/server'

import { ApiRouteError, apiErrorResponse } from '@/lib/api/errors'
import { reconcileVnPayPaymentAttempt } from '@/lib/services/vnpay-payment-reconciliation-service'

export const dynamic = 'force-dynamic'

type ReconciliationBody = {
  attemptId?: unknown
  orderKind?: unknown
}

function clientIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || '127.0.0.1'
}

export async function POST(request: Request) {
  try {
    const callbackSecret = process.env.QSTASH_CALLBACK_SECRET?.trim()
    if (!callbackSecret || request.headers.get('authorization') !== `Bearer ${callbackSecret}`) {
      throw new ApiRouteError(401, 'UNAUTHORIZED', 'Missing or invalid reconciliation authorization token.')
    }

    const body = await request.json() as ReconciliationBody
    if (typeof body.attemptId !== 'string' || !body.attemptId.trim()) {
      throw new ApiRouteError(400, 'INVALID_ATTEMPT_ID', 'Missing VNPay attempt ID.')
    }
    if (body.orderKind !== 'accessory' && body.orderKind !== 'deposit') {
      throw new ApiRouteError(400, 'INVALID_ORDER_KIND', 'Invalid VNPay order kind.')
    }

    const result = await reconcileVnPayPaymentAttempt({
      attemptId: body.attemptId,
      orderKind: body.orderKind,
      clientIp: clientIp(request),
    })
    console.info('VNPAY delayed reconciliation processed', result)

    if (result.status === 'PENDING') {
      return NextResponse.json({ data: result, retry: true }, { status: 503 })
    }
    return NextResponse.json({ data: result, retry: false })
  } catch (error) {
    console.error('Unable to process delayed VNPay reconciliation:', error)
    return apiErrorResponse(error)
  }
}
