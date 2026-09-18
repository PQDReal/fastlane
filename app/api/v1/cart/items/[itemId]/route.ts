import { NextResponse } from 'next/server'

import { requireCurrentCartCustomerId } from '@/lib/api/customer'
import { apiErrorResponse, readJsonBody } from '@/lib/api/errors'
import { createServerTiming } from '@/lib/api/server-timing'
import {
  removeCustomerCartItem,
  updateCustomerCartItem,
} from '@/lib/cart/server'
import {
  parseItemId,
  parseUpdateCartItemRequest,
} from '@/lib/cart/validation'

type RouteContext = { params: Promise<{ itemId: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  const timing = createServerTiming()
  try {
    const sessionStartedAt = performance.now()
    const customerId = await requireCurrentCartCustomerId()
    timing.measure('session', sessionStartedAt)
    const parseStartedAt = performance.now()
    const { itemId } = await context.params
    const variantId = parseItemId(itemId)
    const body = parseUpdateCartItemRequest(await readJsonBody(request))
    timing.measure('parse', parseStartedAt)
    const rpcStartedAt = performance.now()
    const cart = await updateCustomerCartItem(
      customerId,
      variantId,
      body.quantity,
    )
    timing.measure('rpc', rpcStartedAt)
    return timing.attach(NextResponse.json({ data: cart }))
  } catch (error) {
    return timing.attach(apiErrorResponse(error))
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const timing = createServerTiming()
  try {
    const sessionStartedAt = performance.now()
    const customerId = await requireCurrentCartCustomerId()
    timing.measure('session', sessionStartedAt)
    const parseStartedAt = performance.now()
    const { itemId } = await context.params
    const variantId = parseItemId(itemId)
    timing.measure('parse', parseStartedAt)
    const rpcStartedAt = performance.now()
    const cart = await removeCustomerCartItem(
      customerId,
      variantId,
    )
    timing.measure('rpc', rpcStartedAt)
    return timing.attach(NextResponse.json({ data: cart }))
  } catch (error) {
    return timing.attach(apiErrorResponse(error))
  }
}
