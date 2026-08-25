export const SALES_AGENT_CHAT_SESSION_KEY = 'fastlane:sales-agent:chat:v1'

const MAX_PERSISTED_MESSAGES = 60
const MAX_DRAFT_LENGTH = 4_000

type SessionStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type PersistableSalesAgentMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  pending?: boolean
  error?: boolean
}

export type SalesAgentChatSession<TMessage extends PersistableSalesAgentMessage = PersistableSalesAgentMessage> = {
  conversationId?: string
  messages: TMessage[]
  draft: string
}

function isPersistableMessage(value: unknown): value is PersistableSalesAgentMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Record<string, unknown>
  return typeof message.id === 'string'
    && (message.role === 'user' || message.role === 'assistant')
    && typeof message.content === 'string'
}

export function loadSalesAgentChatSession<TMessage extends PersistableSalesAgentMessage>(
  storage: SessionStorageLike,
): SalesAgentChatSession<TMessage> {
  try {
    const raw = storage.getItem(SALES_AGENT_CHAT_SESSION_KEY)
    if (!raw) return { messages: [], draft: '' }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed.version !== 1 || !Array.isArray(parsed.messages)) return { messages: [], draft: '' }

    const messages = parsed.messages
      .filter(isPersistableMessage)
      .slice(-MAX_PERSISTED_MESSAGES)
      .map((message) => message.pending
        ? {
            ...message,
            pending: false,
            error: true,
            content: message.content || 'Phản hồi trước đã bị gián đoạn khi chuyển trang.',
          }
        : message) as TMessage[]

    return {
      conversationId: typeof parsed.conversationId === 'string' && parsed.conversationId
        ? parsed.conversationId
        : undefined,
      messages,
      draft: typeof parsed.draft === 'string' ? parsed.draft.slice(0, MAX_DRAFT_LENGTH) : '',
    }
  } catch {
    return { messages: [], draft: '' }
  }
}

export function saveSalesAgentChatSession<TMessage extends PersistableSalesAgentMessage>(
  storage: SessionStorageLike,
  session: SalesAgentChatSession<TMessage>,
) {
  if (!session.conversationId && session.messages.length === 0 && !session.draft) {
    storage.removeItem(SALES_AGENT_CHAT_SESSION_KEY)
    return
  }

  try {
    storage.setItem(SALES_AGENT_CHAT_SESSION_KEY, JSON.stringify({
      version: 1,
      conversationId: session.conversationId,
      messages: session.messages.slice(-MAX_PERSISTED_MESSAGES),
      draft: session.draft.slice(0, MAX_DRAFT_LENGTH),
      updatedAt: new Date().toISOString(),
    }))
  } catch {
    // Storage can be unavailable or full. Chat remains usable in memory.
  }
}

export function clearSalesAgentChatSession(storage: SessionStorageLike) {
  try {
    storage.removeItem(SALES_AGENT_CHAT_SESSION_KEY)
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}
