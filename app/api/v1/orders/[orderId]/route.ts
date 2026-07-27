import { NextResponse } from 'next/server'

import { requireCurrentCustomer } from '@/lib/api/customer'
import { apiErrorResponse } from '@/lib/api/errors'
import { parseItemId } from '@/lib/cart/validation'
import { readCustomerOrder } from '@/lib/orders/server'

type RouteContext = { params: Promise<{ orderId: string }> }

export async function GET(_request: Request, context: RouteContext) {
  try {
    const customer = await requireCurrentCustomer()
    const { orderId } = await context.params
    const order = await readCustomerOrder(customer.id, parseItemId(orderId))
    return NextResponse.json({ data: order })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
