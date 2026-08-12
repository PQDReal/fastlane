import { NextResponse } from 'next/server'

import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { isSalesAgentProviderId } from '@/lib/sales-agent/providers/config'
import { listSalesAgentProviderConfigs, saveSalesAgentProviderConfig } from '@/lib/sales-agent/providers/registry'

function authorizationError(error: unknown) {
  if (error instanceof ApiAuthError) return authErrorResponse(error)
  throw error
}

export async function GET(request: Request) {
  try {
    await authorizeAdminCatalogRequest(request)
    return NextResponse.json({ data: await listSalesAgentProviderConfigs() }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof ApiAuthError) return authorizationError(error)
    console.error('Sales Agent provider config read failed', error)
    return NextResponse.json({ error: 'Không thể tải cấu hình provider agent.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    return authorizationError(error)
  }

  try {
    const body = await request.json() as Record<string, unknown>
    if (!isSalesAgentProviderId(body.provider)) return NextResponse.json({ error: 'Provider không được hỗ trợ.' }, { status: 400 })
    const data = await saveSalesAgentProviderConfig({
      provider: body.provider,
      displayName: typeof body.displayName === 'string' ? body.displayName : undefined,
      model: typeof body.model === 'string' ? body.model : undefined,
      baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : undefined,
      apiKeyEnv: typeof body.apiKeyEnv === 'string' ? body.apiKeyEnv : undefined,
      enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
      isDefault: typeof body.isDefault === 'boolean' ? body.isDefault : undefined,
    })
    return NextResponse.json({ data }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Dữ liệu cấu hình provider không hợp lệ.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
