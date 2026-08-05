import { NextResponse } from 'next/server'

import { requireCurrentCartCustomerId } from '@/lib/api/customer'
import { apiErrorResponse, readJsonBody } from '@/lib/api/errors'
import { createServerTiming } from '@/lib/api/server-timing'
import { addCustomerCartItem } from '@/lib/cart/server'
import { parseAddCartItemRequest } from '@/lib/cart/validation'

export async function POST(request: Request) {
  const timing = createServerTiming()
  try {
    const sessionStartedAt = performance.now()
    const customerId = await requireCurrentCartCustomerId()
    timing.measure('session', sessionStartedAt)
    const parseStartedAt = performance.now()
    const body = parseAddCartItemRequest(await readJsonBody(request))
    timing.measure('parse', parseStartedAt)
    const rpcStartedAt = performance.now()
    const cart = await addCustomerCartItem(
      customerId,
      body.variantId,
      body.quantity,
    )
    timing.measure('rpc', rpcStartedAt)
    return timing.attach(NextResponse.json({ data: cart }))
  } catch (error) {
    return timing.attach(apiErrorResponse(error))
  }
}
