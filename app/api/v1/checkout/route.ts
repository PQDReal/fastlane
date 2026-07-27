import { NextResponse } from 'next/server'

import { requireCurrentCustomer } from '@/lib/api/customer'
import { apiErrorResponse, readJsonBody } from '@/lib/api/errors'
import {
  parseCheckoutRequest,
  parseIdempotencyKey,
} from '@/lib/cart/validation'
import { checkoutCustomerCart } from '@/lib/orders/checkout'

export async function POST(request: Request) {
  try {
    const customer = await requireCurrentCustomer()
    const idempotencyKey = parseIdempotencyKey(
      request.headers.get('Idempotency-Key'),
    )
    const body = parseCheckoutRequest(await readJsonBody(request))
    const order = await checkoutCustomerCart(
      customer.id,
      idempotencyKey,
      body,
    )
    return NextResponse.json({ data: order }, { status: 201 })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
