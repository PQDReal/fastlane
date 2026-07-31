import { NextResponse } from 'next/server'
import { quoteVehiclePromotion } from '@/lib/promotions/quote'
import { ApiRouteError } from '@/lib/api/errors'

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({}))
    const code = String(payload.code ?? '')
    const subtotal = Number(payload.subtotal ?? 0)
    const vehicleType = payload.vehicleType === 'BIKE' ? 'BIKE' : 'CAR'

    if (!code) {
      return NextResponse.json(
        { error: { message: 'Vui lòng nhập mã giảm giá.', code: 'INVALID_REQUEST' } },
        { status: 400 },
      )
    }

    const quote = await quoteVehiclePromotion(code, subtotal, vehicleType)
    return NextResponse.json({ data: quote })
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return NextResponse.json(
        { error: { message: error.message, code: error.code } },
        { status: error.status },
      )
    }
    console.error('Promotion error:', error)
    return NextResponse.json(
      { error: { message: 'Lỗi hệ thống. Vui lòng thử lại sau.', code: 'INTERNAL_ERROR' } },
      { status: 500 },
    )
  }
}
