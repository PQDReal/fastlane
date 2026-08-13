import { NextResponse } from 'next/server'

import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import {
  AdminAccessoryTemplatePersistenceError,
  listAdminAccessoryTemplateLookups,
} from '@/lib/catalog/admin-accessory-template-server'

function templateError(error: unknown) {
  if (error instanceof AdminAccessoryTemplatePersistenceError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
  }
  return NextResponse.json({ error: 'Không thể tải các lựa chọn mẫu phụ kiện.' }, { status: 500 })
}

export async function GET(request: Request) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    if (error instanceof ApiAuthError) return authErrorResponse(error)
    throw error
  }
  try {
    return NextResponse.json({ data: await listAdminAccessoryTemplateLookups() })
  } catch (error) {
    return templateError(error)
  }
}
