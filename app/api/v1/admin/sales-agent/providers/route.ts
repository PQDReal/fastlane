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

function authorizationError(error: unknown) {
  if (error instanceof ApiAuthError) return authErrorResponse(error)
  throw error
}

export async function GET(request: Request) {
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

    return NextResponse.json(
      { data: withHealth },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (error) {
    if (error instanceof ApiAuthError) return authorizationError(error)
    console.error('Sales Agent provider config read failed', error)
    return NextResponse.json({ error: 'Không thể tải cấu hình provider agent.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    return authorizationError(error)
  }

  try {
    const body = (await request.json()) as Record<string, unknown>
    if (!isSalesAgentProviderId(body.provider)) {
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

    return NextResponse.json({ data }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Dữ liệu cấu hình provider không hợp lệ.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function PUT(request: Request) {
  return POST(request)
}

export async function DELETE(request: Request) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    return authorizationError(error)
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Thiếu tham số id provider.' }, { status: 400 })
    }

    await deleteSalesAgentProviderConfig(id)
    return NextResponse.json({ data: { success: true, message: 'Đã xóa provider instance.' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Lỗi xóa provider.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
