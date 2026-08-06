import { NextResponse } from 'next/server'

import { requireCurrentCustomer } from '@/lib/api/customer'
import { ApiRouteError, apiErrorResponse, readJsonBody } from '@/lib/api/errors'
import {
  parseCheckoutRequest,
  parseIdempotencyKey,
} from '@/lib/cart/validation'
import { checkoutCustomerCart } from '@/lib/orders/checkout'
import { createOrReuseVnPayPayment } from '@/lib/services/vnpay-payment-service'
import { VnPayConfigError } from '@/lib/payments/vnpay'

function clientIp(request: Request) {
  return request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || '127.0.0.1'
}

export async function POST(request: Request) {
  try {
    const customer = await requireCurrentCustomer()
    if (customer.role !== 'CUSTOMER') {
      throw new ApiRouteError(403, 'ADMIN_CHECKOUT_FORBIDDEN', 'Tài khoản quản trị không được đặt hàng.')
    }
    const idempotencyKey = parseIdempotencyKey(
      request.headers.get('Idempotency-Key'),
    )
    const body = parseCheckoutRequest(await readJsonBody(request))
    const order = await checkoutCustomerCart(
      customer.id,
      idempotencyKey,
      body,
    )
    const paymentUrl = await createOrReuseVnPayPayment(order, clientIp(request))
    return NextResponse.json({ data: { ...order, paymentUrl } }, { status: 201 })
  } catch (error) {
    if (error instanceof VnPayConfigError) {
      return apiErrorResponse(new ApiRouteError(
        503,
        'PAYMENT_GATEWAY_NOT_CONFIGURED',
        error.message,
      ))
    }
    if (
      error &&
      typeof error === 'object' &&
      ('code' in error && error.code === 'PGRST205' ||
        'message' in error && String(error.message).includes('vnpay_checkout_attempts'))
    ) {
      return apiErrorResponse(new ApiRouteError(
        503,
        'PAYMENT_SCHEMA_NOT_READY',
        'Database chưa áp dụng migration thanh toán VNPAY cho checkout.',
      ))
    }
    return apiErrorResponse(error)
  }
}
