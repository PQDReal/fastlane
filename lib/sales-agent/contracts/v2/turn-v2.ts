import { z } from 'zod'

export const productTypeV2Schema = z.enum(['CAR', 'BIKE', 'ACCESSORY'])
export type ProductTypeV2 = z.infer<typeof productTypeV2Schema>

export const salesAgentTurnInputV2Schema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('USER_MESSAGE'),
    text: z.string().trim().min(1).max(2000),
  }),
  z.object({
    kind: z.literal('INTERACTION_SUBMIT'),
    interactionId: z.string().trim().min(1).max(120),
    selectedOptionIds: z.array(z.string().trim().min(1).max(120)).min(1),
    freeText: z.string().trim().max(500).optional(),
    continuationToken: z.string().trim().min(1),
  }),
  z.object({
    kind: z.literal('SUGGESTION_SELECT'),
    suggestionId: z.string().trim().min(1).max(120),
    continuationToken: z.string().trim().min(1),
  }),
  z.object({
    kind: z.literal('ACTION_INVOKE'),
    actionId: z.string().trim().min(1).max(120),
    continuationToken: z.string().trim().min(1),
  }),
])
export type SalesAgentTurnInputV2 = z.infer<typeof salesAgentTurnInputV2Schema>

export const createSalesAgentTurnRequestV2Schema = z.object({
  schemaVersion: z.literal('2.0'),
  clientTurnId: z.string().trim().min(1).max(120),
  conversationRef: z.string().trim().min(1).max(120),
  input: salesAgentTurnInputV2Schema,
  context: z.object({
    pageToken: z.string().trim().optional(),
  }).optional(),
  locale: z.literal('vi-VN').default('vi-VN'),
  clientCapabilities: z.object({
    responseBlocks: z.boolean().default(true),
    interactions: z.array(z.enum(['CHOICE', 'RANGE'])).default(['CHOICE', 'RANGE']),
    resumableEvents: z.boolean().default(true),
  }).optional(),
})
export type CreateSalesAgentTurnRequestV2 = z.infer<typeof createSalesAgentTurnRequestV2Schema>
