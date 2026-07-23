import { NextResponse } from 'next/server'

import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { authorizeAdminPrepurchaseRequest } from '@/lib/auth/prepurchase'
import {
  TEST_DRIVE_STATUSES,
  TestDriveTransitionError,
  transitionTestDriveRequest,
  type TestDriveStatus,
} from '@/lib/services/admin-test-drive-service'

export async function POST(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  try {
    await authorizeAdminPrepurchaseRequest(request)
  } catch (error) {
    if (error instanceof ApiAuthError) return authErrorResponse(error)
    throw error
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION_FAILED', message: 'Dữ liệu không hợp lệ' } },
      { status: 400 },
    )
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_FAILED', message: 'Dữ liệu không hợp lệ' } },
      { status: 400 },
    )
  }

  const input = body as Record<string, unknown>
  const action = typeof input.action === 'string' ? input.action : ''
  const expectedCurrentStatus =
    typeof input.expectedCurrentStatus === 'string'
      ? input.expectedCurrentStatus
      : ''
  const reason =
    typeof input.reason === 'string' && input.reason.trim()
      ? input.reason.trim()
      : null

  if (
    !TEST_DRIVE_STATUSES.includes(expectedCurrentStatus as TestDriveStatus) ||
    (reason && reason.length > 500)
  ) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_FAILED', message: 'Dữ liệu chuyển trạng thái không hợp lệ' } },
      { status: 400 },
    )
  }

  try {
    const { requestId } = await context.params
    const data = await transitionTestDriveRequest({
      id: requestId,
      action,
      expectedCurrentStatus: expectedCurrentStatus as TestDriveStatus,
      reason,
    })
    return NextResponse.json({ data })
  } catch (error) {
    if (error instanceof TestDriveTransitionError) {
      const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'INVALID_ACTION' ? 400 : 409
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status },
      )
    }
    console.error('Unable to transition test-drive request:', error)
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Không thể cập nhật trạng thái' } },
      { status: 500 },
    )
  }
}
