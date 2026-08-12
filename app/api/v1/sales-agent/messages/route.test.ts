import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ complete: vi.fn() }))
vi.mock('@/lib/sales-agent/providers/registry', () => ({ completeWithSalesAgentProvider: mocks.complete }))
vi.mock('@/lib/sales-agent/catalog/context', () => ({ searchSalesAgentCatalog: vi.fn().mockResolvedValue([]), serializeCatalogContext: vi.fn().mockReturnValue('CATALOG_RESULT') }))
vi.mock('server-only', () => ({}))

import { POST } from './route'

describe('Sales Agent message API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SALES_AGENT_ENABLED = 'true'
    mocks.complete.mockResolvedValue({ text: 'VF 8 có thể phù hợp với nhu cầu của bạn.', provider: 'openai', model: 'gpt-5.6-luna' })
  })

  it('returns SSE metadata, text and provider result', async () => {
    const response = await POST(new Request('http://localhost/api/v1/sales-agent/messages', { method: 'POST', body: JSON.stringify({ message: 'Tư vấn VF 8', locale: 'vi-VN' }) }))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const body = await response.text()
    expect(body).toContain('"type":"meta"')
    expect(body).toContain('VF 8 có thể phù hợp')
    expect(body).toContain('"model":"gpt-5.6-luna"')
  })

  it('rejects empty messages before calling a provider', async () => {
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ message: '  ' }) }))
    expect(response.status).toBe(400)
    expect(mocks.complete).not.toHaveBeenCalled()
  })

  it('redacts sensitive values before the provider call', async () => {
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ message: 'Số điện thoại của tôi là 0912345678, OTP 123456' }) }))
    await response.text()
    const input = mocks.complete.mock.calls[0][0]
    expect(JSON.stringify(input)).not.toContain('0912345678')
    expect(JSON.stringify(input)).not.toContain('123456')
  })

  it('fails closed when the feature flag is off', async () => {
    process.env.SALES_AGENT_ENABLED = 'false'
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ message: 'Xin chào' }) }))
    expect(response.status).toBe(503)
    expect(mocks.complete).not.toHaveBeenCalled()
  })
})
