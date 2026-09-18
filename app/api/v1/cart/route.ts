import { NextResponse } from 'next/server'

import { requireCurrentCustomer } from '@/lib/api/customer'
import { apiErrorResponse } from '@/lib/api/errors'
import { readCustomerCart } from '@/lib/cart/server'

export async function GET() {
  try {
    const customer = await requireCurrentCustomer()
    // A cart page load must reflect current inventory even when an older cart
    // snapshot is still present in Redis.
    const cart = await readCustomerCart(customer.id, { fresh: true })
    return NextResponse.json({ data: cart })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
