import { describe, expect, it } from 'vitest'
import {
  estimateSalesAgentHistoryTokens,
  limitSalesAgentHistory,
  parseSalesAgentMessageRequest,
  SALES_AGENT_MAX_HISTORY_TOKENS,
  SALES_AGENT_MAX_HISTORY_TURNS,
} from './message'

describe('sales agent history contract', () => {
  it('keeps the newest twenty user-led turns by FIFO order', () => {
    const history = Array.from({ length: 21 }, (_, index) => [
      { role: 'user' as const, content: `user-${index + 1}` },
      { role: 'assistant' as const, content: `assistant-${index + 1}` },
    ]).flat()

    const bounded = limitSalesAgentHistory(history)

    expect(bounded).toHaveLength(SALES_AGENT_MAX_HISTORY_TURNS * 2)
    expect(bounded[0]?.content).toBe('user-2')
    expect(bounded.at(-1)?.content).toBe('assistant-21')
  })

  it('drops the oldest complete turns when the estimated token budget is reached', () => {
    const history = Array.from({ length: SALES_AGENT_MAX_HISTORY_TURNS }, (_, index) => [
      { role: 'user' as const, content: `user-${index}-${'u'.repeat(1_800)}` },
      { role: 'assistant' as const, content: `assistant-${index}-${'a'.repeat(1_800)}` },
    ]).flat()

    const bounded = limitSalesAgentHistory(history)

    expect(estimateSalesAgentHistoryTokens(bounded)).toBeLessThanOrEqual(SALES_AGENT_MAX_HISTORY_TOKENS)
    expect(bounded.length).toBeLessThan(history.length)
    expect(bounded[0]?.content).toContain('user-12')
    expect(bounded.at(-1)?.content).toContain('assistant-19')
  })

  it('removes assistant orphans and duplicate assistant replay entries', () => {
    const bounded = limitSalesAgentHistory([
      { role: 'assistant', content: 'orphan' },
      { role: 'user', content: 'question' },
      { role: 'assistant', content: 'answer' },
      { role: 'assistant', content: 'replayed answer' },
    ])

    expect(bounded).toEqual([
      { role: 'user', content: 'question' },
      { role: 'assistant', content: 'answer' },
    ])
  })

  it('sanitizes and bounds untrusted request history before returning the payload', () => {
    const parsed = parseSalesAgentMessageRequest({
      message: 'Tiếp tục',
      guestHistory: Array.from({ length: 25 }, (_, index) => [
        { role: 'user', content: `u-${index}` },
        { role: 'assistant', content: `a-${index}` },
      ]).flat(),
    })

    expect(parsed.guestHistory).toHaveLength(SALES_AGENT_MAX_HISTORY_TURNS * 2)
    expect(parsed.guestHistory?.[0]?.content).toBe('u-5')
  })

  it('parses a structured interaction response without accepting arbitrary fields', () => {
    const parsed = parseSalesAgentMessageRequest({
      message: 'Tiếp tục',
      conversationId: 'conversation-1',
      interactionResponse: {
        interactionId: 'interaction-1',
        selectedOptionIds: ['option-a', 'option-b'],
        continuationToken: 'signed-token',
      },
    })
    expect(parsed.interactionResponse).toEqual({ interactionId: 'interaction-1', selectedOptionIds: ['option-a', 'option-b'], continuationToken: 'signed-token' })
    expect(() => parseSalesAgentMessageRequest({ message: 'Tiếp tục', interactionResponse: { interactionId: 'i', selectedOptionIds: [], continuationToken: 't' } })).toThrow('không hợp lệ')
  })
})
