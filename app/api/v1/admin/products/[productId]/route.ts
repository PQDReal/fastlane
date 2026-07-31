import { NextResponse } from 'next/server'

import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import {
  AdminAccessoryPersistenceError,
  loadAdminAccessoryProduct,
  saveAdminAccessoryProduct,
} from '@/lib/catalog/admin-accessory-server'
import {
  AdminAccessoryWriteValidationError,
  parseAdminAccessoryWriteRequest,
} from '@/lib/catalog/admin-accessory-write'
import {
  adminAccessoryErrorResponse,
  adminAccessoryPersistenceResponse,
  adminAccessoryValidationResponse,
} from '@/lib/catalog/admin-accessory-api'

type Context = { params: Promise<{ productId: string }> }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function authorizationError(error: unknown) {
  if (error instanceof ApiAuthError) return authErrorResponse(error)
  throw error
}

async function authorizedProductId(request: Request, context: Context) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    return { ok: false as const, response: authorizationError(error) }
  }
  const { productId } = await context.params
  if (!UUID_PATTERN.test(productId)) {
    return {
      ok: false as const,
      response: adminAccessoryErrorResponse(400, 'VALIDATION_FAILED', 'Mã sản phẩm không hợp lệ.', {
        field: { path: 'productId', code: 'INVALID_FORMAT', rule: 'PRODUCT_ID_INVALID' },
      }),
    }
  }
  return { ok: true as const, productId }
}

export async function GET(request: Request, context: Context) {
  const resolved = await authorizedProductId(request, context)
  if (!resolved.ok) return resolved.response

  try {
    const data = await loadAdminAccessoryProduct(resolved.productId)
    return NextResponse.json({ data })
  } catch (error) {
    if (error instanceof AdminAccessoryPersistenceError) return adminAccessoryPersistenceResponse(error)
    return adminAccessoryErrorResponse(500, 'INTERNAL_ERROR', 'Không thể tải sản phẩm phụ kiện.')
  }
}

export async function PATCH(request: Request, context: Context) {
  const resolved = await authorizedProductId(request, context)
  if (!resolved.ok) return resolved.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return adminAccessoryErrorResponse(400, 'VALIDATION_FAILED', 'Nội dung JSON không hợp lệ.', {
      field: { path: 'body', code: 'INVALID_FORMAT', rule: 'INVALID_JSON' },
    })
  }

  try {
    const payload = parseAdminAccessoryWriteRequest(body, { requireExpectedUpdatedAt: true })
    const data = await saveAdminAccessoryProduct(payload, resolved.productId)
    return NextResponse.json({ data })
  } catch (error) {
    if (error instanceof AdminAccessoryWriteValidationError) {
      return adminAccessoryValidationResponse(error)
    }
    if (error instanceof AdminAccessoryPersistenceError) return adminAccessoryPersistenceResponse(error)
    return adminAccessoryErrorResponse(500, 'INTERNAL_ERROR', 'Không thể cập nhật sản phẩm phụ kiện.')
  }
}
