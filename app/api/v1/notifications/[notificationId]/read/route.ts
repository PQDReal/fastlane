import { NextResponse } from 'next/server'

import { requireCurrentCustomer } from '@/lib/api/customer'
import { ApiRouteError, apiErrorResponse } from '@/lib/api/errors'
import { markCustomerNotificationRead } from '@/lib/notifications/server'

type RouteContext = { params: Promise<{ notificationId: string }> }

export async function PATCH(_request: Request, context: RouteContext) {
  try {
    const customer = await requireCurrentCustomer()
    if (customer.role !== 'CUSTOMER') {
      throw new ApiRouteError(403, 'INSUFFICIENT_PERMISSION', 'A customer account is required.')
    }
    const { notificationId } = await context.params
    await markCustomerNotificationRead(customer.id, notificationId)
    return NextResponse.json({ data: { success: true } }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
