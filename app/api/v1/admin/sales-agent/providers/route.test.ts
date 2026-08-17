import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  list: vi.fn(),
  save: vi.fn(),
}))

vi.mock('@/lib/auth/admin', () => ({ authorizeAdminCatalogRequest: mocks.authorize }))
vi.mock('@/lib/sales-agent/providers/registry', () => ({ listSalesAgentProviderConfigs: mocks.list, saveSalesAgentProviderConfig: mocks.save }))
vi.mock('server-only', () => ({}))

import { GET, PUT } from './route'

describe('Sales Agent provider admin API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorize.mockResolvedValue(undefined)
    mocks.list.mockResolvedValue([{ provider: 'openai', model: 'gpt-5.6-luna', apiKeyEnv: 'OPENAI_API_KEY', enabled: true, isDefault: true }])
    mocks.save.mockImplementation(async (value) => ({ id: '1', ...value }))
  })

  it('requires admin authorization before reading providers', async () => {
    const { ApiAuthError } = await import('@/lib/auth/errors')
    mocks.authorize.mockRejectedValue(new ApiAuthError(403, 'INSUFFICIENT_PERMISSION', 'Forbidden'))
    const response = await GET(new Request('http://localhost/api/v1/admin/sales-agent/providers'))
    expect(response.status).toBe(403)
    expect(mocks.list).not.toHaveBeenCalled()
  })

  it('returns provider metadata without an API key value', async () => {
    const response = await GET(new Request('http://localhost/api/v1/admin/sales-agent/providers'))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data[0].apiKeyEnv).toBe('OPENAI_API_KEY')
    expect(body.data[0]).not.toHaveProperty('apiKey')
  })

  it('validates provider and passes safe settings to the registry', async () => {
    const response = await PUT(new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ provider: 'openai', model: 'gpt-5.6-luna', enabled: true, isDefault: true }) }))
    expect(response.status).toBe(200)
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ provider: 'openai', model: 'gpt-5.6-luna' }))
    expect(mocks.save.mock.calls[0][0]).not.toHaveProperty('apiKey')
  })

  it('rejects unknown provider', async () => {
    const response = await PUT(new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ provider: 'unknown' }) }))
    expect(response.status).toBe(400)
    expect(mocks.save).not.toHaveBeenCalled()
  })
})
