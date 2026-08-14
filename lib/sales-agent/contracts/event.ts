import { z } from 'zod'
import { salesAgentActionSchema, salesAgentSuggestionSchema } from './action'
import { salesAgentInteractionSchema } from './interaction'
import { assistantBlockSchema, factPointerSchema, toolObservationRefSchema, turnViewModelSchema } from './response'

export const turnStartedEventSchema = z.object({
  type: z.literal('turn_started'),
  turnId: z.string().trim().min(1),
  conversationId: z.string().trim().min(1),
})

export const textDeltaEventSchema = z.object({
  type: z.literal('text_delta'),
  delta: z.string(),
})

export const toolStatusEventSchema = z.object({
  type: z.literal('tool_status'),
  tool: z.string().trim().min(1),
  status: z.enum(['running', 'complete', 'not_found', 'error']),
})

export const factDiscoveredEventSchema = z.object({
  type: z.literal('fact_discovered'),
  fact: factPointerSchema,
})

export const blockEmittedEventSchema = z.object({
  type: z.literal('block_emitted'),
  block: assistantBlockSchema,
})

export const turnViewModelEventSchema = z.object({
  type: z.literal('turn_view'),
  viewModel: turnViewModelSchema,
})

export const turnCompletedEventSchema = z.object({
  type: z.literal('done'),
  provider: z.string(),
  model: z.string(),
  finishReason: z.enum(['stop', 'requires_input', 'budget_exceeded', 'error']),
})

export const salesAgentEventSchema = z.discriminatedUnion('type', [
  turnStartedEventSchema,
  textDeltaEventSchema,
  toolStatusEventSchema,
  factDiscoveredEventSchema,
  blockEmittedEventSchema,
  turnViewModelEventSchema,
  turnCompletedEventSchema,
])
export type SalesAgentEvent = z.infer<typeof salesAgentEventSchema>
