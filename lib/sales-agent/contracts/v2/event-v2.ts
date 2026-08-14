import { z } from 'zod'
import { turnViewModelV2Schema } from './response-v2'

export const salesAgentEventV2Schema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('turn.accepted'),
    turnId: z.string(),
    timestamp: z.string().datetime(),
  }),
  z.object({
    type: z.literal('turn.progress'),
    stage: z.string(),
    message: z.string().optional(),
    timestamp: z.string().datetime().optional(),
  }),
  z.object({
    type: z.literal('tool.called'),
    tool: z.string(),
    toolCallId: z.string(),
    timestamp: z.string().datetime().optional(),
  }),
  z.object({
    type: z.literal('tool.observation'),
    tool: z.string(),
    outcome: z.string(),
    observationId: z.string(),
    timestamp: z.string().datetime().optional(),
  }),
  z.object({
    type: z.literal('turn.completed'),
    turnId: z.string(),
    response: turnViewModelV2Schema,
    timestamp: z.string().datetime().optional(),
  }),
  z.object({
    type: z.literal('turn.failed'),
    turnId: z.string(),
    error: z.object({
      code: z.string(),
      message: z.string(),
    }),
    timestamp: z.string().datetime().optional(),
  }),
  z.object({
    type: z.literal('turn.cancelled'),
    turnId: z.string(),
    reason: z.string().optional(),
    timestamp: z.string().datetime().optional(),
  }),
])

export type SalesAgentEventV2 = z.infer<typeof salesAgentEventV2Schema>
