import type { SalesAgentInteraction, SalesAgentInteractionResponse } from './interaction'

export type SalesAgentMessage = {
  role: 'user' | 'assistant'
  content: string
}

export const SALES_AGENT_MAX_HISTORY_TURNS = 20
export const SALES_AGENT_MAX_HISTORY_TOKENS = 10_000
export const SALES_AGENT_MAX_HISTORY_MESSAGES = SALES_AGENT_MAX_HISTORY_TURNS * 2
export const SALES_AGENT_MESSAGE_MAX_CHARS = 2_000
const SALES_AGENT_TOKEN_CHAR_RATIO = 3
const SALES_AGENT_MESSAGE_OVERHEAD_TOKENS = 3

export function estimateSalesAgentTextTokens(value: string) {
  return Math.ceil(value.length / SALES_AGENT_TOKEN_CHAR_RATIO)
}

export function estimateSalesAgentMessageTokens(message: SalesAgentMessage) {
  return SALES_AGENT_MESSAGE_OVERHEAD_TOKENS + estimateSalesAgentTextTokens(message.content)
}

export function estimateSalesAgentHistoryTokens(history: SalesAgentMessage[]) {
  return SALES_AGENT_MESSAGE_OVERHEAD_TOKENS + history.reduce((total, message) => total + estimateSalesAgentMessageTokens(message), 0)
}

function toUserLedTurns(history: SalesAgentMessage[]) {
  const turns: SalesAgentMessage[][] = []
  for (const message of history) {
    if (message.role === 'user') {
      turns.push([message])
      continue
    }
    const currentTurn = turns.at(-1)
    // A normal client turn contains one user and one assistant message. Ignore
    // duplicate assistant entries so the bounded context cannot be inflated by
    // orphaned or replayed provider events.
    if (currentTurn && currentTurn.length === 1) currentTurn.push(message)
  }
  return turns
}

/** Keeps the newest complete user-led turns within both context limits. */
export function limitSalesAgentHistory(history: SalesAgentMessage[]) {
  const turns = toUserLedTurns(history)
  const keptTurns: SalesAgentMessage[][] = []
  let estimatedTokens = SALES_AGENT_MESSAGE_OVERHEAD_TOKENS

  for (let index = turns.length - 1; index >= 0 && keptTurns.length < SALES_AGENT_MAX_HISTORY_TURNS; index -= 1) {
    const turn = turns[index]
    const turnTokens = turn.reduce((total, message) => total + estimateSalesAgentMessageTokens(message), 0)
    if (keptTurns.length > 0 && estimatedTokens + turnTokens > SALES_AGENT_MAX_HISTORY_TOKENS) break
    keptTurns.unshift(turn)
    estimatedTokens += turnTokens
  }

  return keptTurns.flat()
}

export type SalesAgentMessageRequest = {
  conversationId?: string
  message: string
  guestHistory?: SalesAgentMessage[]
  interactionResponse?: SalesAgentInteractionResponse
  pageContext?: { routeKey: string; entityId?: string }
  locale?: 'vi-VN'
}

export type SalesAgentSseEvent =
  | { type: 'meta'; conversationId: string; messageId: string }
  | { type: 'tool_status'; tool: string; status: 'running' | 'OK' | 'PARTIAL' | 'NOT_FOUND' | 'AMBIGUOUS' | 'UNAVAILABLE' }
  | { type: 'text_delta'; delta: string }
  | { type: 'interaction'; interaction: SalesAgentInteraction }
  | { type: 'done'; provider: string; model: string; finishReason: 'stop' | 'requires_input' }
  | { type: 'error'; code: string; message: string; retryable: boolean }

export function parseSalesAgentMessageRequest(value: unknown): SalesAgentMessageRequest {
  if (!value || typeof value !== 'object') throw new SalesAgentRequestError('Request phải là JSON object.')
  const input = value as Record<string, unknown>
  const message = typeof input.message === 'string' ? input.message.trim() : ''
  if (!message) throw new SalesAgentRequestError('Vui lòng nhập câu hỏi cho agent.')
  if (message.length > SALES_AGENT_MESSAGE_MAX_CHARS) throw new SalesAgentRequestError('Câu hỏi tối đa 2.000 ký tự.')

  const history = Array.isArray(input.guestHistory) ? input.guestHistory : []
  const guestHistory = limitSalesAgentHistory(history.slice(-SALES_AGENT_MAX_HISTORY_MESSAGES).flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    if ((row.role !== 'user' && row.role !== 'assistant') || typeof row.content !== 'string') return []
    const content = row.content.trim().slice(0, SALES_AGENT_MESSAGE_MAX_CHARS)
    return content ? [{ role: row.role, content } as SalesAgentMessage] : []
  }))

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

  const interactionResponse = input.interactionResponse && typeof input.interactionResponse === 'object'
    ? parseInteractionResponse(input.interactionResponse)
    : undefined

  return {
    conversationId: typeof input.conversationId === 'string' ? input.conversationId.slice(0, 120) : undefined,
    message,
    guestHistory,
    interactionResponse,
    pageContext,
    locale: input.locale === 'vi-VN' || input.locale == null ? 'vi-VN' : undefined,
  }
}

function parseInteractionResponse(value: object): SalesAgentInteractionResponse {
  const input = value as Record<string, unknown>
  const interactionId = typeof input.interactionId === 'string' ? input.interactionId.trim().slice(0, 120) : ''
  const continuationToken = typeof input.continuationToken === 'string' ? input.continuationToken.slice(0, 8_192) : ''
  if (!Array.isArray(input.selectedOptionIds) || input.selectedOptionIds.some((item) => typeof item !== 'string')) {
    throw new SalesAgentRequestError('Lựa chọn tương tác không hợp lệ.')
  }
  const selectedOptionIds = input.selectedOptionIds.map((item) => item.trim()).filter(Boolean)
  const freeText = typeof input.freeText === 'string' ? input.freeText.trim().slice(0, 500) : undefined
  if (!interactionId || !continuationToken || selectedOptionIds.length > 8 || new Set(selectedOptionIds).size !== selectedOptionIds.length || !selectedOptionIds.length && !freeText) {
    throw new SalesAgentRequestError('Lựa chọn tương tác không hợp lệ.')
  }
  return { interactionId, selectedOptionIds, ...(freeText ? { freeText } : {}), continuationToken }
}

export class SalesAgentRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SalesAgentRequestError'
  }
}
