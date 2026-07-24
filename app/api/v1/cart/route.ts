import { NextResponse } from 'next/server'

import { requireCurrentCustomer } from '@/lib/api/customer'
import { apiErrorResponse } from '@/lib/api/errors'
import { readCustomerCart } from '@/lib/cart/server'

export async function GET() {
  try {
    const customer = await requireCurrentCustomer()
    const cart = await readCustomerCart(customer.id)
    return NextResponse.json({ data: cart })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
