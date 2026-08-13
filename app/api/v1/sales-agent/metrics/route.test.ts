import { beforeEach, describe, expect, it, vi } from 'vitest'

const record = vi.hoisted(() => vi.fn())
vi.mock('@/lib/sales-agent/telemetry', () => ({
  parseSalesAgentInteractionMetric: (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value as object).some((key) => !['event', 'slot', 'mode', 'resultCount'].includes(key))) throw new Error('Metric field không được hỗ trợ.')
    return value
  },
  recordSalesAgentInteractionMetric: record,
  salesAgentInteractionMetricsEnabled: () => true,
}))

import { POST } from './route'

describe('Sales Agent metrics API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('records aggregate interaction dimensions without user content', async () => {
    const response = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ event: 'interaction_search', slot: 'vehicles', mode: 'multiple', resultCount: 4 }),
    }))

    expect(response.status).toBe(204)
    expect(record).toHaveBeenCalledWith({ event: 'interaction_search', slot: 'vehicles', mode: 'multiple', resultCount: 4 })
  })

  it('rejects prompt, labels and continuation tokens', async () => {
    const response = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ event: 'interaction_viewed', prompt: 'VF 8', label: 'VF 8', continuationToken: 'secret' }),
    }))

    expect(response.status).toBe(400)
    expect(record).not.toHaveBeenCalled()
  })
})
