import { NextResponse } from 'next/server'

import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { isSalesAgentProviderId, normalizeProviderConfig } from '@/lib/sales-agent/providers/config'
import { testSalesAgentProviderConnection } from '@/lib/sales-agent/providers/registry'

function authorizationError(error: unknown) {
  if (error instanceof ApiAuthError) return authErrorResponse(error)
  throw error
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
      return NextResponse.json({ error: 'Provider không hợp lệ.' }, { status: 400 })
    }

    const normalized = normalizeProviderConfig({
      provider: body.provider,
      displayName: typeof body.displayName === 'string' ? body.displayName : undefined,
      model: typeof body.model === 'string' ? body.model : undefined,
      baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : undefined,
      apiKeyEnv: typeof body.apiKeyEnv === 'string' ? body.apiKeyEnv : undefined,
      customApiKeys: Array.isArray(body.customApiKeys) ? body.customApiKeys : undefined,
      timeoutMs: typeof body.timeoutMs === 'number' ? body.timeoutMs : 6000,
      enabled: true,
      isDefault: false,
    })

    const testResult = await testSalesAgentProviderConnection({
      id: typeof body.id === 'string' ? body.id : normalized.provider,
      ...normalized,
    })

    return NextResponse.json({ data: testResult })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kiểm tra kết nối thất bại.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
