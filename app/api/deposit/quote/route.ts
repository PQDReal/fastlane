import { NextResponse } from 'next/server'

import { ApiRouteError } from '@/lib/api/errors'
import {
  DepositInputError,
  parseDepositSelectionInput,
} from '@/lib/deposit/order-input'
import { buildDepositVehicleQuote } from '@/lib/deposit/quote'

function errorResponse(
  status: number,
  code: string,
  message: string,
  field?: string,
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        requestId: crypto.randomUUID(),
        ...(field ? { field } : {}),
      },
    },
    { status },
  )
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse(400, 'VALIDATION_FAILED', 'Dữ liệu JSON không hợp lệ.')
  }

  try {
    const selection = parseDepositSelectionInput(body)
    const quote = await buildDepositVehicleQuote(selection)
    return NextResponse.json({
      data: {
        depositAmount: quote.depositAmount,
        subtotal: quote.subtotal,
        discountAmount: quote.discountAmount,
        totalEstimatedPrice: quote.totalEstimatedPrice,
        promotion: quote.promotion,
      },
    })
  } catch (error) {
    if (error instanceof DepositInputError) {
      return errorResponse(
        error.field === 'promotion_code' ? 422 : 409,
        error.field === 'promotion_code'
          ? 'PROMOTION_NOT_APPLICABLE'
          : 'DEPOSIT_SELECTION_INVALID',
        error.message,
        error.field,
      )
    }
    if (error instanceof ApiRouteError) {
      return errorResponse(error.status, error.code, error.message, 'promotion_code')
    }
    console.error('Unable to quote deposit:', error)
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Không thể tính báo giá đặt cọc.')
  }
}
