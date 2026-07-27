import { NextResponse } from 'next/server'

import { authorizeAdminPrepurchaseRequest } from '@/lib/auth/prepurchase'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import {
  ADMIN_TEST_DRIVE_SORTS,
  listAdminTestDriveRequests,
  TEST_DRIVE_STATUSES,
  type AdminTestDriveSort,
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
  const sort = searchParams.get('sort')
  if (status && !TEST_DRIVE_STATUSES.includes(status as TestDriveStatus)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_FAILED', message: 'Trạng thái không hợp lệ' } },
      { status: 400 },
    )
  }

  if (sort && !ADMIN_TEST_DRIVE_SORTS.includes(sort as AdminTestDriveSort)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_FAILED', message: 'Kiểu sắp xếp không hợp lệ' } },
      { status: 400 },
    )
  }

  try {
    const data = await listAdminTestDriveRequests({
      query: searchParams.get('q') ?? undefined,
      status: (status as TestDriveStatus | null) ?? undefined,
      sort: (sort as AdminTestDriveSort | null) ?? undefined,
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
