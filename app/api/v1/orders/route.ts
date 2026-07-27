import { NextResponse } from 'next/server'

import { requireCurrentCustomer } from '@/lib/api/customer'
import { apiErrorResponse } from '@/lib/api/errors'
import { listCustomerOrders } from '@/lib/orders/server'

export async function GET(request: Request) {
  try {
    const customer = await requireCurrentCustomer()
    const params = new URL(request.url).searchParams
    const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1)
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(params.get('limit') || '20', 10) || 20),
    )
    return NextResponse.json(
      await listCustomerOrders(customer.id, page, limit),
    )
  } catch (error) {
    return apiErrorResponse(error)
  }
}
