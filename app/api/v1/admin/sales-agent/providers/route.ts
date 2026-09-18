import { NextResponse } from 'next/server'

import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { isSalesAgentProviderId } from '@/lib/sales-agent/providers/config'
import {
  deleteSalesAgentProviderConfig,
  listSalesAgentProviderConfigs,
  saveSalesAgentProviderConfig,
} from '@/lib/sales-agent/providers/registry'
import { apiKeyPoolManager } from '@/lib/sales-agent/providers/key-pool'
import { recordSalesAgentDebugEvent } from '@/lib/sales-agent/debug-log'

function authorizationError(error: unknown) {
  if (error instanceof ApiAuthError) return authErrorResponse(error)
  throw error
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID()
  const startedAt = Date.now()
  try {
    await authorizeAdminCatalogRequest(request)
    const configs = await listSalesAgentProviderConfigs()

    const withHealth = configs.map((config) => {
      const poolStatus = apiKeyPoolManager.getPoolStatus(
        config.id || config.provider,
        config.apiKeyEnv,
        config.customApiKeys,
      )
      return {
        ...config,
        keyPool: poolStatus,
      }
    })

    recordSalesAgentDebugEvent('admin.provider.list.completed', { requestId }, {
      configCount: configs.length,
      enabledCount: configs.filter((config) => config.enabled).length,
      elapsedMs: Date.now() - startedAt,
    })
    return NextResponse.json(
      { data: withHealth },
      { headers: { 'Cache-Control': 'private, no-store', 'X-Sales-Agent-Request-Id': requestId } },
    )
  } catch (error) {
    if (error instanceof ApiAuthError) {
      recordSalesAgentDebugEvent('admin.provider.list.rejected', { requestId }, {
        reasonCode: error.code,
        elapsedMs: Date.now() - startedAt,
      })
      return authorizationError(error)
    }
    console.error('Sales Agent provider config read failed', error)
    recordSalesAgentDebugEvent('admin.provider.list.failed', { requestId }, {
      reasonCode: 'REGISTRY_READ_FAILED',
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    })
    return NextResponse.json({ error: 'Không thể tải cấu hình provider agent.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID()
  const startedAt = Date.now()
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    if (error instanceof ApiAuthError) {
      recordSalesAgentDebugEvent('admin.provider.save.rejected', { requestId }, {
        reasonCode: error.code,
        elapsedMs: Date.now() - startedAt,
      })
    }
    return authorizationError(error)
  }

  try {
    const body = (await request.json()) as Record<string, unknown>
    if (!isSalesAgentProviderId(body.provider)) {
      recordSalesAgentDebugEvent('admin.provider.save.rejected', { requestId }, {
        reasonCode: 'INVALID_PROVIDER',
        elapsedMs: Date.now() - startedAt,
      })
      return NextResponse.json({ error: 'Provider type không được hỗ trợ.' }, { status: 400 })
    }

    const data = await saveSalesAgentProviderConfig({
      id: typeof body.id === 'string' ? body.id : undefined,
      provider: body.provider,
      displayName: typeof body.displayName === 'string' ? body.displayName : undefined,
      model: typeof body.model === 'string' ? body.model : undefined,
      baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : undefined,
      apiKeyEnv: typeof body.apiKeyEnv === 'string' ? body.apiKeyEnv : undefined,
      customApiKeys: Array.isArray(body.customApiKeys) ? body.customApiKeys : undefined,
      priority: typeof body.priority === 'number' ? body.priority : undefined,
      timeoutMs: typeof body.timeoutMs === 'number' ? body.timeoutMs : undefined,
      enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
      isDefault: typeof body.isDefault === 'boolean' ? body.isDefault : undefined,
    })

    recordSalesAgentDebugEvent('admin.provider.save.completed', { requestId }, {
      provider: body.provider,
      configId: typeof body.id === 'string' ? body.id : undefined,
      elapsedMs: Date.now() - startedAt,
    })
    return NextResponse.json({ data }, { headers: { 'Cache-Control': 'private, no-store', 'X-Sales-Agent-Request-Id': requestId } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Dữ liệu cấu hình provider không hợp lệ.'
    recordSalesAgentDebugEvent('admin.provider.save.failed', { requestId }, {
      reasonCode: 'REGISTRY_WRITE_FAILED',
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    })
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function PUT(request: Request) {
  return POST(request)
}

export async function DELETE(request: Request) {
  const requestId = crypto.randomUUID()
  const startedAt = Date.now()
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    if (error instanceof ApiAuthError) {
      recordSalesAgentDebugEvent('admin.provider.delete.rejected', { requestId }, {
        reasonCode: error.code,
        elapsedMs: Date.now() - startedAt,
      })
    }
    return authorizationError(error)
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      recordSalesAgentDebugEvent('admin.provider.delete.rejected', { requestId }, {
        reasonCode: 'MISSING_PROVIDER_ID',
        elapsedMs: Date.now() - startedAt,
      })
      return NextResponse.json({ error: 'Thiếu tham số id provider.' }, { status: 400 })
    }

    await deleteSalesAgentProviderConfig(id)
    recordSalesAgentDebugEvent('admin.provider.delete.completed', { requestId }, {
      configId: id,
      elapsedMs: Date.now() - startedAt,
    })
    return NextResponse.json({ data: { success: true, message: 'Đã xóa provider instance.' } }, { headers: { 'X-Sales-Agent-Request-Id': requestId } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Lỗi xóa provider.'
    recordSalesAgentDebugEvent('admin.provider.delete.failed', { requestId }, {
      reasonCode: 'REGISTRY_DELETE_FAILED',
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
