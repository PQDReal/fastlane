import { describe, expect, it } from 'vitest'

import {
  SALES_AGENT_CHAT_SESSION_KEY,
  loadSalesAgentChatSession,
  saveSalesAgentChatSession,
} from './chat-session'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
}

describe('Sales Agent chat session cache', () => {
  it('restores the conversation, messages and draft after navigation reloads', () => {
    const storage = memoryStorage()
    saveSalesAgentChatSession(storage, {
      conversationId: 'conv-1',
      messages: [{ id: 'msg-1', role: 'user', content: 'Tư vấn VF 3' }],
      draft: 'So sánh thêm',
    })

    expect(loadSalesAgentChatSession(storage)).toMatchObject({
      conversationId: 'conv-1',
      messages: [{ id: 'msg-1', role: 'user', content: 'Tư vấn VF 3' }],
      draft: 'So sánh thêm',
    })
  })

  it('marks an interrupted streamed reply as an error instead of restoring a pending state', () => {
    const storage = memoryStorage()
    storage.setItem(SALES_AGENT_CHAT_SESSION_KEY, JSON.stringify({
      version: 1,
      messages: [{ id: 'msg-2', role: 'assistant', content: '', pending: true }],
      draft: '',
    }))

    const session = loadSalesAgentChatSession(storage)
    expect(session.messages[0]).toMatchObject({ pending: false, error: true })
    expect(session.messages[0].content).toContain('bị gián đoạn')
  })
})
