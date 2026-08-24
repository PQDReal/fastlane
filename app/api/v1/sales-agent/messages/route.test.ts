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
      provider: 'openai',
      model: 'test-model',
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

  it('does not forward page context to the chat orchestrator', async () => {
    const response = await POST(new Request('http://localhost/api/v1/sales-agent/messages', {
      method: 'POST',
      body: JSON.stringify({
        message: 'Cách kết nối Wi-Fi',
        pageContext: { routeKey: '/cars/vf-5', entityId: 'vf5-id' },
      }),
    }))
    await response.text()

    expect(mocks.runTurn.mock.calls[0][0]).not.toHaveProperty('pageContext')
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

  it('rejects a stale suggestion that references an inactive catalog entity', async () => {
    const response = await POST(new Request('http://localhost/api/v1/sales-agent/messages', {
      method: 'POST',
      body: JSON.stringify({
        message: 'Giá xe',
        suggestionSelection: { suggestionId: 'sug-stale', entityIds: ['removed-product'] },
      }),
    }))

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: { code: 'SUGGESTION_STALE' } })
    expect(mocks.runTurn).not.toHaveBeenCalled()
  })

  it('applies output guardrails before emitting any text delta', async () => {
    mocks.composeTurnResponse.mockReturnValueOnce({
      schemaVersion: '2.0',
      conversationRef: 'conv-safe',
      turnId: 'turn-safe',
      messageId: 'msg-safe',
      answer: {
        markdown: 'Khóa máy chủ là sk-abcdefghijklmnopqrstuvwxyz123456.',
        completeness: 'COMPLETE',
      },
      blocks: [],
      actions: [],
      suggestions: [],
      grounding: { dataAsOf: new Date().toISOString(), warnings: [] },
    })

    const response = await POST(new Request('http://localhost/api/v1/sales-agent/messages', {
      method: 'POST',
      body: JSON.stringify({ message: 'Tư vấn VF 8' }),
    }))
    const body = await response.text()

    expect(mocks.runTurn.mock.calls[0][0].onTextDelta).toBeUndefined()
    expect(body).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456')
    expect(body).toContain('THÔNG TIN ĐÃ ĐƯỢC ẨN')
  })

  it('returns a deterministic turn_view and done event when the orchestrator throws', async () => {
    mocks.runTurn.mockRejectedValueOnce(new Error('provider down'))

    const response = await POST(new Request('http://localhost/api/v1/sales-agent/messages', {
      method: 'POST',
      body: JSON.stringify({ message: 'Giá VF 8' }),
    }))
    const body = await response.text()

    expect(body).toContain('"type":"turn_view"')
    expect(body).toContain('"finishReason":"error"')
    expect(body).not.toContain('"type":"error"')
  })

  it('forwards the real provider, model and budget finish reason', async () => {
    mocks.runTurn.mockResolvedValueOnce({
      ...(await mocks.runTurn()),
      finishReason: 'budget_exceeded',
      provider: 'anthropic',
      model: 'fallback-model',
    })

    const response = await POST(new Request('http://localhost/api/v1/sales-agent/messages', {
      method: 'POST',
      body: JSON.stringify({ message: 'So sánh VF 8 và VF 9' }),
    }))
    const body = await response.text()

    expect(body).toContain('"provider":"anthropic"')
    expect(body).toContain('"model":"fallback-model"')
    expect(body).toContain('"finishReason":"budget_exceeded"')
  })
})
