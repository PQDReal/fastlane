import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runTurn: vi.fn(),
  composeTurnResponse: vi.fn(),
}))
vi.mock('@/lib/sales-agent/orchestrator/run-turn', () => ({ runTurn: mocks.runTurn }))
vi.mock('@/lib/sales-agent/response/composer', () => ({ composeTurnResponse: mocks.composeTurnResponse }))
vi.mock('server-only', () => ({}))

import { POST } from './route'

describe('Canonical Sales Agent message API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SALES_AGENT_ENABLED = 'true'
    mocks.runTurn.mockResolvedValue({
      text: 'VF 8 là dòng SUV điện cỡ D cao cấp của VinFast.',
      responsePlan: {
        schemaVersion: '2.0',
        outcome: 'ANSWER',
        narrative: [{ kind: 'ADVICE', markdown: 'VF 8 là dòng SUV điện cỡ D cao cấp của VinFast.' }],
        views: [],
        suggestionIntents: [],
        actionIntents: [],
      },
      knownEntities: { getAllEntities: () => [] },
      bindings: { getAllBindings: () => [] },
      evidence: { getAllEvidence: () => [], getAllObservations: () => [] },
      toolCallsCount: 1,
      stepsCount: 1,
      finishReason: 'stop',
    })
    mocks.composeTurnResponse.mockReturnValue({
      schemaVersion: '2.0',
      conversationRef: 'conv-123',
      turnId: 'turn-123',
      messageId: 'msg-123',
      answer: {
        markdown: 'VF 8 là dòng SUV điện cỡ D cao cấp của VinFast.',
        completeness: 'COMPLETE',
      },
      blocks: [],
      actions: [],
      suggestions: [{ suggestionId: 'sug-1', label: 'Giá VF 8' }],
      grounding: { dataAsOf: new Date().toISOString(), warnings: [] },
    })
  })

  it('returns SSE metadata, turn_view and done events', async () => {
    const response = await POST(new Request('http://localhost/api/v1/sales-agent/messages', {
      method: 'POST',
      body: JSON.stringify({ message: 'Tư vấn VF 8', locale: 'vi-VN' }),
    }))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const body = await response.text()
    expect(body).toContain('"type":"meta"')
    expect(body).toContain('"type":"turn_view"')
    expect(body).toContain('"markdown":"VF 8 là dòng SUV điện cỡ D cao cấp của VinFast."')
    expect(body).toContain('"type":"done"')
  })

  it('rejects empty messages before calling orchestrator', async () => {
    const response = await POST(new Request('http://localhost/api/v1/sales-agent/messages', {
      method: 'POST',
      body: JSON.stringify({ message: '   ' }),
    }))
    expect(response.status).toBe(400)
    expect(mocks.runTurn).not.toHaveBeenCalled()
  })

  it('redacts sensitive values before calling orchestrator', async () => {
    const response = await POST(new Request('http://localhost/api/v1/sales-agent/messages', {
      method: 'POST',
      body: JSON.stringify({ message: 'Số điện thoại của tôi là 0912345678, OTP 123456' }),
    }))
    await response.text()
    const input = mocks.runTurn.mock.calls[0][0].input
    expect(input.text).not.toContain('0912345678')
    expect(input.text).not.toContain('123456')
  })

  it('fails closed when the feature flag is off', async () => {
    process.env.SALES_AGENT_ENABLED = 'false'
    const response = await POST(new Request('http://localhost/api/v1/sales-agent/messages', {
      method: 'POST',
      body: JSON.stringify({ message: 'Xin chào' }),
    }))
    expect(response.status).toBe(503)
    expect(mocks.runTurn).not.toHaveBeenCalled()
  })
})
