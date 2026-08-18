import { NextResponse } from 'next/server'

import { createServerTiming } from '@/lib/api/server-timing'
import { parseAdminInventoryQuery } from '@/lib/admin-inventory-query'
import {
  legacyAdminInventoryFilterOptions,
  loadLegacyAdminInventory,
} from '@/lib/admin-inventory-legacy'
import { authorizeAdminInventoryRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status })
}

export async function GET(request: Request) {
  const timing = createServerTiming('route')
  const finish = <T extends Response>(response: T) => timing.attach(response)
  const authorizationStartedAt = performance.now()
  try {
    await authorizeAdminInventoryRequest(request, timing)
  } catch (error) {
    timing.measure('authorization', authorizationStartedAt)
    if (error instanceof ApiAuthError) return finish(authErrorResponse(error))
    throw error
  }
  timing.measure('authorization', authorizationStartedAt)

  const parsed = parseAdminInventoryQuery(new URL(request.url).searchParams)
  if (!parsed.ok) return finish(errorResponse(400, 'VALIDATION_ERROR', parsed.message))

  const optionsStartedAt = performance.now()
  const { data, error } = await getSupabaseAdmin().rpc('get_admin_inventory_filter_options', {
    p_product_type: parsed.value.productType,
    p_product_id: parsed.value.productId,
  })
  timing.measure('db_filter_options', optionsStartedAt)

  if (error?.code === 'PGRST202') {
    const fallbackStartedAt = performance.now()
    try {
      const items = await loadLegacyAdminInventory()
      const response = NextResponse.json({
        data: legacyAdminInventoryFilterOptions(
          items,
          parsed.value.productType,
          parsed.value.productId,
        ),
      })
      response.headers.set('X-Fastlane-Inventory-Source', 'legacy')
      timing.measure('db_filter_options_legacy', fallbackStartedAt)
      return finish(response)
    } catch (fallbackError) {
      return finish(errorResponse(500, 'INTERNAL_SERVER_ERROR', fallbackError instanceof Error ? fallbackError.message : 'Không thể tải bộ lọc tồn kho.'))
    }
  }
  if (error) return finish(errorResponse(500, 'INTERNAL_SERVER_ERROR', error.message))
  if (!isObject(data)) {
    return finish(errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Phản hồi bộ lọc tồn kho từ database không hợp lệ.'))
  }

  const response = NextResponse.json({ data })
  response.headers.set('X-Fastlane-Inventory-Source', 'rpc')
  return finish(response)
}
