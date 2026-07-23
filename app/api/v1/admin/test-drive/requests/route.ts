import { NextResponse } from 'next/server'

import { authorizeAdminPrepurchaseRequest } from '@/lib/auth/prepurchase'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import {
  listAdminTestDriveRequests,
  TEST_DRIVE_STATUSES,
  type TestDriveStatus,
} from '@/lib/services/admin-test-drive-service'

export async function GET(request: Request) {
  try {
    await authorizeAdminPrepurchaseRequest(request)
  } catch (error) {
    if (error instanceof ApiAuthError) return authErrorResponse(error)
    throw error
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  if (status && !TEST_DRIVE_STATUSES.includes(status as TestDriveStatus)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_FAILED', message: 'Trạng thái không hợp lệ' } },
      { status: 400 },
    )
  }

  try {
    const data = await listAdminTestDriveRequests({
      query: searchParams.get('q') ?? undefined,
      status: (status as TestDriveStatus | null) ?? undefined,
    })
    return NextResponse.json({
      data,
      meta: { page: 1, limit: data.length, total: data.length, totalPages: 1 },
    })
  } catch (error) {
    console.error('Unable to list test-drive requests:', error)
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Không thể tải lịch lái thử' } },
      { status: 500 },
    )
  }
}
