import { NextResponse } from 'next/server'

import { requireCurrentCustomer } from '@/lib/api/customer'
import { apiErrorResponse, readJsonBody } from '@/lib/api/errors'
import { addCustomerCartItem } from '@/lib/cart/server'
import { parseAddCartItemRequest } from '@/lib/cart/validation'

export async function POST(request: Request) {
  try {
    const customer = await requireCurrentCustomer()
    const body = parseAddCartItemRequest(await readJsonBody(request))
    const cart = await addCustomerCartItem(
      customer.id,
      body.variantId,
      body.quantity,
    )
    return NextResponse.json({ data: cart })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
