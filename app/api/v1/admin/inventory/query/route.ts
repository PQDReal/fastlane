import { NextResponse } from 'next/server'

import { createServerTiming } from '@/lib/api/server-timing'
import { authorizeAdminInventoryRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseAdminInventoryQuery } from '@/lib/admin-inventory-query'
import {
  legacyAdminInventoryFilterOptions,
  loadLegacyAdminInventory,
  queryLegacyAdminInventory,
} from '@/lib/admin-inventory-legacy'

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
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

  const params = parsed.value
  const supabase = getSupabaseAdmin()
  const rpcArgs = {
    p_search: params.search,
    p_product_type: params.productType,
    p_product_id: params.productId,
    p_variant: params.variant ?? 'ALL',
    p_color: params.color ?? 'ALL',
    p_interior_color: params.interiorColor ?? 'ALL',
    p_status: params.status,
    p_activity: params.activity,
    p_limit: params.limit,
    p_cursor: params.cursor,
  }

  const inventoryStartedAt = performance.now()
  const inventoryResult = await supabase.rpc('list_admin_inventory', rpcArgs)
  timing.measure('db_inventory', inventoryStartedAt)

  if (inventoryResult.error) {
    if (inventoryResult.error.code === 'PGRST202') {
      const fallbackStartedAt = performance.now()
      try {
        const items = await loadLegacyAdminInventory()
        const data = queryLegacyAdminInventory(items, params)
        const response = NextResponse.json({
          data: {
            ...data,
            ...(params.includeFilterOptions ? {
              filterOptions: legacyAdminInventoryFilterOptions(items, params.productType, params.productId),
            } : {}),
          },
        })
        response.headers.set('X-Fastlane-Inventory-Source', 'legacy')
        timing.measure('db_inventory_legacy', fallbackStartedAt)
        return finish(response)
      } catch (error) {
        return finish(errorResponse(500, 'INTERNAL_SERVER_ERROR', error instanceof Error ? error.message : 'Không thể tải tồn kho.'))
      }
    }
    const status = inventoryResult.error.code === '22023' ? 400 : 500
    return finish(errorResponse(status, status === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_SERVER_ERROR', inventoryResult.error.message))
  }
  if (!isObject(inventoryResult.data)) {
    return finish(errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Phản hồi tồn kho từ database không hợp lệ.'))
  }

  let filterOptions: JsonObject | undefined
  if (params.includeFilterOptions) {
    const optionsStartedAt = performance.now()
    const optionsResult = await supabase.rpc('get_admin_inventory_filter_options', {
      p_product_type: params.productType,
      p_product_id: params.productId,
    })
    timing.measure('db_filter_options', optionsStartedAt)
    if (optionsResult.error) {
      return finish(errorResponse(500, 'INTERNAL_SERVER_ERROR', optionsResult.error.message))
    }
    if (!isObject(optionsResult.data)) {
      return finish(errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Phản hồi bộ lọc tồn kho từ database không hợp lệ.'))
    }
    filterOptions = optionsResult.data
  }

  const transformStartedAt = performance.now()
  const response = NextResponse.json({
    data: {
      items: Array.isArray(inventoryResult.data.items) ? inventoryResult.data.items : [],
      nextCursor: typeof inventoryResult.data.nextCursor === 'string' ? inventoryResult.data.nextCursor : null,
      hasMore: inventoryResult.data.hasMore === true,
      limit: typeof inventoryResult.data.limit === 'number' ? inventoryResult.data.limit : params.limit,
      summary: isObject(inventoryResult.data.summary) ? inventoryResult.data.summary : {
        totalRows: 0,
        totalQuantity: 0,
        statusCounts: {},
      },
      ...(filterOptions ? { filterOptions } : {}),
    },
  })
  timing.measure('transform', transformStartedAt)
  response.headers.set('X-Fastlane-Inventory-Source', 'rpc')
  return finish(response)
}
