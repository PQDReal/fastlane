import { NextResponse } from 'next/server'

import { authorizeAdminCatalogRequest } from '@/lib/auth/admin'
import { ApiAuthError, authErrorResponse } from '@/lib/auth/errors'
import { isSalesAgentProviderId, normalizeProviderConfig } from '@/lib/sales-agent/providers/config'
import { testSalesAgentProviderConnection } from '@/lib/sales-agent/providers/registry'
import { recordSalesAgentDebugEvent } from '@/lib/sales-agent/debug-log'

function authorizationError(error: unknown) {
  if (error instanceof ApiAuthError) return authErrorResponse(error)
  throw error
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID()
  const startedAt = Date.now()
  try {
    await authorizeAdminCatalogRequest(request)
  } catch (error) {
    if (error instanceof ApiAuthError) {
      recordSalesAgentDebugEvent('admin.provider.test.rejected', { requestId }, {
        reasonCode: error.code,
        elapsedMs: Date.now() - startedAt,
      })
    }
    return authorizationError(error)
  }

  try {
    const body = (await request.json()) as Record<string, unknown>
    if (!isSalesAgentProviderId(body.provider)) {
      recordSalesAgentDebugEvent('admin.provider.test.rejected', { requestId }, {
        reasonCode: 'INVALID_PROVIDER',
        elapsedMs: Date.now() - startedAt,
      })
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

    recordSalesAgentDebugEvent('admin.provider.test.completed', { requestId }, {
      provider: normalized.provider,
      model: normalized.model,
      ok: testResult.ok,
      latencyMs: testResult.latencyMs,
      error: testResult.error ? { name: 'ProviderConnectionError', message: testResult.error } : undefined,
      elapsedMs: Date.now() - startedAt,
    })
    return NextResponse.json({ data: testResult }, { headers: { 'X-Sales-Agent-Request-Id': requestId } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kiểm tra kết nối thất bại.'
    recordSalesAgentDebugEvent('admin.provider.test.failed', { requestId }, {
      reasonCode: 'PROVIDER_TEST_FAILED',
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
