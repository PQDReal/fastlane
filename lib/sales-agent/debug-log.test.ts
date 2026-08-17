import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { recordSalesAgentDebugEvent } from './debug-log'

describe('sales agent debug logging', () => {
  beforeEach(() => {
    delete process.env.SALES_AGENT_DEBUG_LOG_FILE
  })

  afterEach(() => {
    delete process.env.SALES_AGENT_DEBUG_LOGS_ENABLED
    vi.restoreAllMocks()
  })

  it('is disabled by default', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    expect(recordSalesAgentDebugEvent('request.accepted', {}, { message: 'Xin chào' })).toBe(false)
    expect(info).not.toHaveBeenCalled()
  })

  it('logs structured chat traces while redacting credentials, PII and signed tokens', () => {
    process.env.SALES_AGENT_DEBUG_LOGS_ENABLED = 'true'
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    expect(recordSalesAgentDebugEvent('tool.completed', { conversationId: 'conversation-1', messageId: 'message-1' }, {
      message: 'Gọi tôi qua 0912345678, OTP 123456',
      continuationToken: 'signed-secret-value',
      continuationSignature: 'private-signature-value',
      usage: { inputTokens: 12, outputTokens: 8 },
    })).toBe(true)

    const serialized = String(info.mock.calls[0]?.[1])
    expect(serialized).toContain('tool.completed')
    expect(serialized).toContain('conversation-1')
    expect(serialized).toContain('[redacted]')
    expect(serialized).toContain('"inputTokens":12')
    expect(serialized).not.toContain('0912345678')
    expect(serialized).not.toContain('123456')
    expect(serialized).not.toContain('signed-secret-value')
    expect(serialized).not.toContain('private-signature-value')
  })
})
