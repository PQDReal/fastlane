export type SalesAgentMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type SalesAgentMessageRequest = {
  conversationId?: string
  message: string
  guestHistory?: SalesAgentMessage[]
  pageContext?: { routeKey: string; entityId?: string }
  locale?: 'vi-VN'
}

export type SalesAgentSseEvent =
  | { type: 'meta'; conversationId: string; messageId: string }
  | { type: 'tool_status'; tool: string; status: 'running' | 'OK' | 'PARTIAL' | 'NOT_FOUND' | 'AMBIGUOUS' | 'UNAVAILABLE' }
  | { type: 'text_delta'; delta: string }
  | { type: 'done'; provider: string; model: string; finishReason: 'stop' }
  | { type: 'error'; code: string; message: string; retryable: boolean }

export function parseSalesAgentMessageRequest(value: unknown): SalesAgentMessageRequest {
  if (!value || typeof value !== 'object') throw new SalesAgentRequestError('Request phải là JSON object.')
  const input = value as Record<string, unknown>
  const message = typeof input.message === 'string' ? input.message.trim() : ''
  if (!message) throw new SalesAgentRequestError('Vui lòng nhập câu hỏi cho agent.')
  if (message.length > 2_000) throw new SalesAgentRequestError('Câu hỏi tối đa 2.000 ký tự.')

  const history = Array.isArray(input.guestHistory) ? input.guestHistory : []
  const guestHistory = history.slice(-20).flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    if ((row.role !== 'user' && row.role !== 'assistant') || typeof row.content !== 'string') return []
    const content = row.content.trim().slice(0, 2_000)
    return content ? [{ role: row.role, content } as SalesAgentMessage] : []
  })

  const pageContext = input.pageContext && typeof input.pageContext === 'object'
    ? {
        routeKey: typeof (input.pageContext as Record<string, unknown>).routeKey === 'string'
          ? String((input.pageContext as Record<string, unknown>).routeKey).slice(0, 120)
          : '',
        entityId: typeof (input.pageContext as Record<string, unknown>).entityId === 'string'
          ? String((input.pageContext as Record<string, unknown>).entityId).slice(0, 120)
          : undefined,
      }
    : undefined

  return {
    conversationId: typeof input.conversationId === 'string' ? input.conversationId.slice(0, 120) : undefined,
    message,
    guestHistory,
    pageContext,
    locale: input.locale === 'vi-VN' || input.locale == null ? 'vi-VN' : undefined,
  }
}

export class SalesAgentRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SalesAgentRequestError'
  }
}
