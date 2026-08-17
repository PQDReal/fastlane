import { z } from 'zod'

export const productTypeSchema = z.enum(['CAR', 'BIKE', 'ACCESSORY'])
export type ProductType = z.infer<typeof productTypeSchema>

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

function toUserLedTurns(history: SalesAgentMessage[]) {
  const turns: SalesAgentMessage[][] = []
  for (const message of history) {
    if (message.role === 'user') {
      turns.push([message])
      continue
    }
    const currentTurn = turns.at(-1)
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

export const salesAgentUserMessageInputSchema = z.object({
  kind: z.literal('USER_MESSAGE'),
  text: z.string().trim().min(1).max(2000),
})

export const salesAgentInteractionSubmitInputSchema = z.object({
  kind: z.literal('INTERACTION_SUBMIT'),
  interactionId: z.string().trim().min(1),
  selectedOptionIds: z.array(z.string().trim().min(1)).min(1).max(8),
  freeText: z.string().trim().max(500).optional(),
  continuationToken: z.string().trim().min(1),
})

export const salesAgentSuggestionSelectInputSchema = z.object({
  kind: z.literal('SUGGESTION_SELECT'),
  suggestionId: z.string().trim().min(1),
  payload: z.string().trim().optional(),
})

export const salesAgentActionInvokeInputSchema = z.object({
  kind: z.literal('ACTION_INVOKE'),
  actionId: z.string().trim().min(1),
  continuationToken: z.string().trim().min(1),
})

export const salesAgentTurnInputSchema = z.discriminatedUnion('kind', [
  salesAgentUserMessageInputSchema,
  salesAgentInteractionSubmitInputSchema,
  salesAgentSuggestionSelectInputSchema,
  salesAgentActionInvokeInputSchema,
])
export type SalesAgentTurnInput = z.infer<typeof salesAgentTurnInputSchema>

export const createSalesAgentTurnRequestSchema = z.object({
  schemaVersion: z.literal('2.0').default('2.0'),
  conversationId: z.string().trim().min(1).optional(),
  clientTurnId: z.string().trim().min(1),
  input: salesAgentTurnInputSchema,
  pageContext: z.object({
    routeKey: z.string().trim().min(1).optional(),
    currentProductId: z.string().trim().min(1).optional(),
    currentProductType: productTypeSchema.optional(),
  }).optional(),
  locale: z.literal('vi-VN').default('vi-VN'),
})
export type CreateSalesAgentTurnRequest = z.infer<typeof createSalesAgentTurnRequestSchema>

export class SalesAgentRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SalesAgentRequestError'
  }
}

export type SalesAgentMessageRequest = {
  conversationId?: string
  message: string
  guestHistory?: SalesAgentMessage[]
  interactionResponse?: {
    interactionId: string
    selectedOptionIds: string[]
    freeText?: string
    continuationToken: string
  }
  pageContext?: { routeKey: string; entityId?: string }
  locale?: 'vi-VN'
}

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

  return {
    conversationId: typeof input.conversationId === 'string' ? input.conversationId.slice(0, 120) : undefined,
    message,
    guestHistory,
    interactionResponse: input.interactionResponse as any,
    pageContext,
    locale: input.locale === 'vi-VN' || input.locale == null ? 'vi-VN' : undefined,
  }
}
