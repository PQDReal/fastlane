import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/current-user'
import {
  createTestDriveReservation,
  ReservationConflictError,
} from '@/lib/services/reservation-service'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PHONE_PATTERN = /^\+?[0-9]{9,15}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function apiError(status: number, code: string, message: string) {
  return NextResponse.json(
    { error: { code, message, requestId: crypto.randomUUID() } },
    { status },
  )
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(400, 'VALIDATION_FAILED', 'Dữ liệu gửi lên không hợp lệ')
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return apiError(400, 'VALIDATION_FAILED', 'Dữ liệu gửi lên phải là object')
  }

  const input = body as Record<string, unknown>
  const productId = typeof input.productId === 'string' ? input.productId : ''
  const testDriveDate =
    typeof input.testDriveDate === 'string' ? input.testDriveDate : ''
  const testDriveTime =
    typeof input.testDriveTime === 'string' ? input.testDriveTime : ''
  const fullName = typeof input.fullName === 'string' ? input.fullName.trim() : ''
  const phoneNumber =
    typeof input.phoneNumber === 'string'
      ? input.phoneNumber.replace(/[\s.-]/g, '')
      : ''
  const email =
    typeof input.email === 'string' && input.email.trim()
      ? input.email.trim().toLowerCase()
      : null
  const note =
    typeof input.note === 'string' && input.note.trim()
      ? input.note.trim()
      : null

  if (!UUID_PATTERN.test(productId)) {
    return apiError(400, 'VALIDATION_FAILED', 'Mẫu xe không hợp lệ')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testDriveDate)) {
    return apiError(400, 'VALIDATION_FAILED', 'Ngày lái thử không hợp lệ')
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(testDriveTime)) {
    return apiError(400, 'VALIDATION_FAILED', 'Giờ lái thử không hợp lệ')
  }
  if (fullName.length < 1 || fullName.length > 120) {
    return apiError(400, 'VALIDATION_FAILED', 'Họ tên phải có từ 1 đến 120 ký tự')
  }
  if (!PHONE_PATTERN.test(phoneNumber)) {
    return apiError(400, 'VALIDATION_FAILED', 'Số điện thoại phải có từ 9 đến 15 chữ số')
  }
  if (email && (!EMAIL_PATTERN.test(email) || email.length > 254)) {
    return apiError(400, 'VALIDATION_FAILED', 'Email không hợp lệ')
  }
  if (note && note.length > 500) {
    return apiError(400, 'VALIDATION_FAILED', 'Ghi chú không được vượt quá 500 ký tự')
  }
  if (input.privacyConsent !== true || input.licenceAcknowledged !== true) {
    return apiError(
      400,
      'VALIDATION_FAILED',
      'Bạn phải đồng ý chính sách và xác nhận điều kiện lái thử',
    )
  }

  const scheduledAt = new Date(
    `${testDriveDate}T${testDriveTime}:00+07:00`,
  )
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
    return apiError(400, 'VALIDATION_FAILED', 'Thời gian lái thử phải ở tương lai')
  }

  let currentUser = null
  try {
    currentUser = await getCurrentUser()
  } catch (error) {
    console.error('Unable to resolve reservation customer:', error)
  }

  try {
    const reservation = await createTestDriveReservation({
      customerId: currentUser?.id ?? null,
      productId,
      scheduledAt: scheduledAt.toISOString(),
      fullName,
      phoneNumber,
      email,
      note,
      privacyPolicyVersion: '2026-07',
      marketingConsent: input.marketingConsent === true,
    })
    return NextResponse.json({ data: reservation }, { status: 201 })
  } catch (error) {
    if (error instanceof ReservationConflictError) {
      return apiError(409, 'DUPLICATE_TEST_DRIVE_REQUEST', error.message)
    }
    console.error('Unable to create test-drive reservation:', error)
    return apiError(500, 'INTERNAL_SERVER_ERROR', 'Không thể tạo yêu cầu lái thử')
  }
}
