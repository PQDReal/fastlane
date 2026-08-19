import { NextResponse } from 'next/server'
import type { ServiceBookingPayload } from '@/lib/api/after-sales-types'

export async function POST(req: Request) {
  try {
    const payload: ServiceBookingPayload = await req.json()

    if (!payload.fullName || !payload.phoneNumber || !payload.vehicleModel || !payload.preferredDate) {
      return NextResponse.json(
        { success: false, message: 'Vui lòng cung cấp đầy đủ thông tin bắt buộc (họ tên, số điện thoại, mẫu xe và ngày hẹn).' },
        { status: 400 },
      )
    }

    // Generate booking reference code
    const bookingCode = `BK-${Date.now().toString().slice(-6)}`

    return NextResponse.json({
      success: true,
      data: {
        bookingCode,
        receivedAt: new Date().toISOString(),
        booking: payload,
      },
      message: `Đặt lịch dịch vụ thành công! Mã hẹn của bạn là ${bookingCode}. Đội ngũ FASTLANE sẽ liên hệ xác nhận trong ít phút.`,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || 'Có lỗi xảy ra khi tiếp nhận đặt lịch.' },
      { status: 500 },
    )
  }
}
