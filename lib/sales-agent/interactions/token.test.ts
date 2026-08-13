import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { consumeSalesAgentInteractionResponse, signSalesAgentInteractionToken } from './token'

const payload = {
  schemaVersion: '1.0' as const,
  interactionId: 'interaction-1',
  conversationId: 'conversation-1',
  messageId: 'message-1',
  slot: 'vehicles' as const,
  mode: 'multiple' as const,
  minSelections: 2,
  maxSelections: 3,
  allowFreeText: false,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  options: {
    a: { label: 'VF 7', value: 'vehicle-a', kind: 'product' as const },
    b: { label: 'VF 8', value: 'vehicle-b', kind: 'product' as const },
  },
}

describe('sales agent signed interaction continuation', () => {
  beforeEach(() => {
    process.env.SALES_AGENT_INTERACTION_SECRET = 'test-secret'
  })

  it('binds a response to the conversation and option allowlist', () => {
    const token = signSalesAgentInteractionToken(payload)
    const result = consumeSalesAgentInteractionResponse({ interactionId: 'interaction-1', selectedOptionIds: ['a', 'b'], continuationToken: token }, 'conversation-1')
    expect(result.selectedOptions.map((option) => option.value)).toEqual(['vehicle-a', 'vehicle-b'])
  })

  it('rejects forged, cross-conversation and replayed responses', () => {
    const token = signSalesAgentInteractionToken({ ...payload, interactionId: 'interaction-2' })
    expect(() => consumeSalesAgentInteractionResponse({ interactionId: 'interaction-2', selectedOptionIds: ['a', 'b'], continuationToken: token }, 'other-conversation')).toThrow('không thuộc')
    expect(() => consumeSalesAgentInteractionResponse({ interactionId: 'interaction-2', selectedOptionIds: ['a', 'missing'], continuationToken: token }, 'conversation-1')).toThrow('không thuộc')
    const validResponse = { interactionId: 'interaction-2', selectedOptionIds: ['a', 'b'], continuationToken: token }
    expect(consumeSalesAgentInteractionResponse(validResponse, 'conversation-1').selectedOptions).toHaveLength(2)
    expect(() => consumeSalesAgentInteractionResponse(validResponse, 'conversation-1')).toThrow('gửi trước đó')
  })
})
