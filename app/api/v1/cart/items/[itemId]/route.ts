import { NextResponse } from 'next/server'

import { requireCurrentCustomer } from '@/lib/api/customer'
import { apiErrorResponse, readJsonBody } from '@/lib/api/errors'
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
  try {
    const customer = await requireCurrentCustomer()
    const { itemId } = await context.params
    const variantId = parseItemId(itemId)
    const body = parseUpdateCartItemRequest(await readJsonBody(request))
    const cart = await updateCustomerCartItem(
      customer.id,
      variantId,
      body.quantity,
    )
    return NextResponse.json({ data: cart })
  } catch (error) {
    return apiErrorResponse(error)
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const customer = await requireCurrentCustomer()
    const { itemId } = await context.params
    const cart = await removeCustomerCartItem(
      customer.id,
      parseItemId(itemId),
    )
    return NextResponse.json({ data: cart })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
