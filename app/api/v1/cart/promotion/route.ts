import { NextResponse } from 'next/server'

import { requireCurrentCustomer } from '@/lib/api/customer'
import { apiErrorResponse, readJsonBody } from '@/lib/api/errors'
import {
  listAccessoryPromotionQuotes,
  quoteAccessoryPromotion,
} from '@/lib/promotions/quote'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  try {
    const customer = await requireCurrentCustomer()
    const itemIds = [...new Set(new URL(request.url).searchParams.getAll('item'))]
    if (itemIds.length === 0 || itemIds.some((id) => !UUID_PATTERN.test(id))) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Sản phẩm không hợp lệ.' } },
        { status: 400 },
      )
    }

    const promotions = await listAccessoryPromotionQuotes(customer.id, itemIds)
    return NextResponse.json({ data: promotions })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
export async function PUT(request: Request) {
  try {
    const customer = await requireCurrentCustomer()
    const body = await readJsonBody(request)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Dữ liệu không hợp lệ.' } },
        { status: 400 },
      )
    }

    const input = body as Record<string, unknown>
    if (
      typeof input.code !== 'string' ||
      !Array.isArray(input.cartItemIds) ||
      input.cartItemIds.some((id) => typeof id !== 'string' || !UUID_PATTERN.test(id))
    ) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Mã giảm giá hoặc sản phẩm không hợp lệ.' } },
        { status: 400 },
      )
    }

    const quote = await quoteAccessoryPromotion(
      customer.id,
      input.code,
      [...new Set(input.cartItemIds as string[])],
    )
    return NextResponse.json({ data: quote })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
