import { z } from 'zod'
import { productTypeSchema } from './turn'

export const navigationActionKeySchema = z.enum([
  'BROWSE_CATALOG',
  'VIEW_PRODUCT',
  'OPEN_COMPARE',
  'OPEN_PROMOTIONS',
  'DISCOVER_ACCESSORIES',
  'CONSULT_AGENT',
])
export type NavigationActionKey = z.infer<typeof navigationActionKeySchema>

export const navigationIntentSchema = z.object({
  actionKey: navigationActionKeySchema,
  entityId: z.string().trim().min(1).optional(),
  entityType: productTypeSchema.optional(),
  parameters: z.record(z.string(), z.string()).optional(),
})
export type NavigationIntent = z.infer<typeof navigationIntentSchema>

export const salesAgentActionSchema = z.object({
  actionId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  kind: z.enum(['PRIMARY', 'SECONDARY', 'LINK']).default('SECONDARY'),
  target: z.discriminatedUnion('type', [
    z.object({ type: z.literal('ROUTE'), href: z.string().trim().min(1) }),
    z.object({ type: z.literal('EXTERNAL_LINK'), url: z.string().url() }),
    z.object({ type: z.literal('CONTINUATION_ACTION'), token: z.string().trim().min(1) }),
  ]),
  actionKey: navigationActionKeySchema.optional(),
  entityId: z.string().trim().min(1).optional(),
})
export type SalesAgentAction = z.infer<typeof salesAgentActionSchema>

export const suggestionIntentSchema = z.object({
  text: z.string().trim().min(1).max(200),
  payload: z.string().trim().optional(),
  category: z.enum(['FOLLOW_UP', 'ALTERNATIVE', 'CLARIFICATION']).optional(),
  targetEntityId: z.string().trim().min(1).optional(),
})
export type SuggestionIntent = z.infer<typeof suggestionIntentSchema>

export const salesAgentSuggestionSchema = z.object({
  suggestionId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  payload: z.string().trim().optional(),
})
export type SalesAgentSuggestion = z.infer<typeof salesAgentSuggestionSchema>
