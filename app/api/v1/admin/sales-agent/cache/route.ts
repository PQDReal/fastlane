import { NextResponse } from 'next/server'
import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { catalogCacheEngine } from '@/lib/sales-agent/cache/catalog-cache'
import { invalidateProviderCache } from '@/lib/sales-agent/providers/registry'
import { recordSalesAgentDebugEvent } from '@/lib/sales-agent/debug-log'

export async function GET(request: Request) {
  const requestId = crypto.randomUUID()
  const startedAt = Date.now()
  try {
    await authorizeAdminCatalogRequest(request)
    const status = catalogCacheEngine.getStatus()
    recordSalesAgentDebugEvent('admin.cache.status.completed', { requestId }, {
      status,
      elapsedMs: Date.now() - startedAt,
    })
    return NextResponse.json({ data: status }, { headers: { 'X-Sales-Agent-Request-Id': requestId } })
  } catch (error) {
    if (error instanceof ApiAuthError) return authErrorResponse(error)
    recordSalesAgentDebugEvent('admin.cache.status.failed', { requestId }, {
      reasonCode: 'CACHE_STATUS_FAILED',
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    })
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Lỗi lấy trạng thái cache.' } },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID()
  const startedAt = Date.now()
  try {
    await authorizeAdminCatalogRequest(request)
    invalidateProviderCache()
    const newSnapshot = await catalogCacheEngine.forceRefresh()
    const status = catalogCacheEngine.getStatus()
    recordSalesAgentDebugEvent('admin.cache.refresh.completed', { requestId }, {
      status,
      refreshedAt: newSnapshot.lastRefreshedAt,
      elapsedMs: Date.now() - startedAt,
    })
    return NextResponse.json({
      data: {
        message: 'Làm mới bộ nhớ đệm AI thành công.',
        status,
        refreshedAt: new Date(newSnapshot.lastRefreshedAt).toISOString(),
      },
    }, { headers: { 'X-Sales-Agent-Request-Id': requestId } })
  } catch (error) {
    if (error instanceof ApiAuthError) return authErrorResponse(error)
    recordSalesAgentDebugEvent('admin.cache.refresh.failed', { requestId }, {
      reasonCode: 'CACHE_REFRESH_FAILED',
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    })
    return NextResponse.json(
      { error: { code: 'REFRESH_FAILED', message: error instanceof Error ? error.message : 'Làm mới cache thất bại.' } },
      { status: 500 },
    )
  }
}
