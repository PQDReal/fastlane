import { NextResponse } from 'next/server'

import { requireCurrentCustomer } from '@/lib/api/customer'
import { ApiRouteError, apiErrorResponse } from '@/lib/api/errors'
import {
  countUnreadCustomerNotifications,
  listCustomerNotifications,
  markAllCustomerNotificationsRead,
} from '@/lib/notifications/server'

function requireCustomerRole(role: string) {
  if (role !== 'CUSTOMER') {
    throw new ApiRouteError(403, 'INSUFFICIENT_PERMISSION', 'A customer account is required.')
  }
}

export async function GET(request: Request) {
  try {
    const customer = await requireCurrentCustomer()
    requireCustomerRole(customer.role)
    const params = new URL(request.url).searchParams
    if (params.get('summary') === 'true') {
      const unreadCount = await countUnreadCustomerNotifications(customer.id)
      return NextResponse.json(
        { data: { items: [], unreadCount, nextCursor: null } },
        { headers: { 'Cache-Control': 'private, no-store' } },
      )
    }
    const limit = Math.min(50, Math.max(1, Number.parseInt(params.get('limit') || '20', 10) || 20))
    const cursor = params.get('cursor')?.trim() || undefined
    if (cursor && Number.isNaN(Date.parse(cursor))) {
      throw new ApiRouteError(400, 'VALIDATION_ERROR', 'cursor must be an ISO timestamp.')
    }
    const data = await listCustomerNotifications(customer.id, {
      limit,
      cursor,
      unreadOnly: params.get('unreadOnly') === 'true',
    })
    return NextResponse.json({ data }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return apiErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const customer = await requireCurrentCustomer()
    requireCustomerRole(customer.role)
    const body = await request.json().catch(() => null) as { action?: unknown } | null
    if (body?.action !== 'READ_ALL') {
      throw new ApiRouteError(400, 'VALIDATION_ERROR', 'action must be READ_ALL.')
    }
    await markAllCustomerNotificationsRead(customer.id)
    return NextResponse.json({ data: { success: true } }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
