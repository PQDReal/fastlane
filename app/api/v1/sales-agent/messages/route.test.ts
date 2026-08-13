import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  plan: vi.fn(),
  executeTools: vi.fn(),
  serializeTools: vi.fn(),
  resolveNavigation: vi.fn(),
}))
vi.mock('@/lib/sales-agent/providers/registry', () => ({ completeWithSalesAgentProvider: mocks.complete }))
vi.mock('@/lib/sales-agent/tools/planner', () => ({ planSalesAgentTools: mocks.plan }))
vi.mock('@/lib/sales-agent/tools/registry', () => ({ executeSalesAgentTools: mocks.executeTools, serializeSalesAgentToolResults: mocks.serializeTools }))
vi.mock('@/lib/sales-agent/navigation/resolver', () => ({ resolveSalesAgentNavigation: mocks.resolveNavigation, navigationActionMarkdown: vi.fn().mockReturnValue('[Xem xe](/cars/vf-8)'), stripUntrustedNavigation: vi.fn((value: string) => value) }))
vi.mock('server-only', () => ({}))

import { POST } from './route'

describe('Sales Agent message API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SALES_AGENT_ENABLED = 'true'
    mocks.complete.mockResolvedValue({ text: 'VF 8 có thể phù hợp với nhu cầu của bạn.', provider: 'openai', model: 'gpt-5.6-luna' })
    mocks.plan.mockResolvedValue({ calls: [] })
    mocks.executeTools.mockResolvedValue([])
    mocks.serializeTools.mockReturnValue(undefined)
    mocks.resolveNavigation.mockResolvedValue(null)
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

  it('passes bounded tool evidence to the provider', async () => {
    mocks.plan.mockResolvedValue({ calls: [{ name: 'get_vehicle_details', arguments: { productId: '00000000-0000-4000-8000-000000000000' } }] })
    mocks.executeTools.mockResolvedValue([{ tool: 'get_vehicle_details', schemaVersion: '1.0', status: 'OK', data: { vehicle: { name: 'VF 8', pricing: { from: 900000000 } } }, readAt: '2026-08-12T00:00:00.000Z', dataAsOf: '2026-08-12T00:00:00.000Z', evidence: [], warnings: [] }])
    mocks.serializeTools.mockReturnValue('TOOL_RESULTS: VF 8 = 900000000')

    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ message: 'Giá VF 8 hiện tại?' }) }))
    const body = await response.text()

    expect(mocks.executeTools).toHaveBeenCalledWith([{ name: 'get_vehicle_details', arguments: { productId: '00000000-0000-4000-8000-000000000000' } }])
    expect(JSON.stringify(mocks.complete.mock.calls[0][0])).toContain('TOOL_RESULTS: VF 8 = 900000000')
    expect(body).toContain('"type":"tool_status"')
  })

  it('appends a server-resolved link only for a navigation intent', async () => {
    mocks.plan.mockResolvedValue({ calls: [], navigationIntent: { actionKey: 'VIEW_PRODUCT', entityType: 'CAR', entityId: 'vf8' } })
    mocks.resolveNavigation.mockResolvedValue({ actionKey: 'VIEW_PRODUCT', entityType: 'CAR', entityId: 'vf8', label: 'Xem VF 8', href: '/cars/vf-8' })

    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ message: 'Gửi tôi link VF 8' }) }))
    const body = await response.text()

    expect(body).toContain('[Xem xe](/cars/vf-8)')
  })

  it('fails closed when the feature flag is off', async () => {
    process.env.SALES_AGENT_ENABLED = 'false'
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ message: 'Xin chào' }) }))
    expect(response.status).toBe(503)
    expect(mocks.complete).not.toHaveBeenCalled()
  })
})
