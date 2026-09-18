import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({ record: vi.fn(), enabled: vi.fn(() => true) }))
vi.mock('@/lib/sales-agent/telemetry', () => ({
  parseSalesAgentInteractionMetric: (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value as object).some((key) => !['event', 'slot', 'mode', 'resultCount'].includes(key))) throw new Error('Metric field không được hỗ trợ.')
    return value
  },
  recordSalesAgentInteractionMetric: mocks.record,
  salesAgentInteractionMetricsEnabled: mocks.enabled,
}))

import { POST } from './route'

describe('Sales Agent metrics API', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.enabled.mockReturnValue(true) })

  it('records aggregate interaction dimensions without user content', async () => {
    const response = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ event: 'interaction_search', slot: 'vehicles', mode: 'multiple', resultCount: 4 }),
    }))

    expect(response.status).toBe(204)
    expect(mocks.record).toHaveBeenCalledWith({ event: 'interaction_search', slot: 'vehicles', mode: 'multiple', resultCount: 4 })
  })

  it('rejects prompt, labels and continuation tokens', async () => {
    const response = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ event: 'interaction_viewed', prompt: 'VF 8', label: 'VF 8', continuationToken: 'secret' }),
    }))

    expect(response.status).toBe(400)
    expect(mocks.record).not.toHaveBeenCalled()
  })

  it('fails closed when the metrics kill switch is off', async () => {
    mocks.enabled.mockReturnValue(false)
    const response = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ event: 'interaction_viewed' }),
    }))

    expect(response.status).toBe(204)
    expect(mocks.record).not.toHaveBeenCalled()
  })
})
