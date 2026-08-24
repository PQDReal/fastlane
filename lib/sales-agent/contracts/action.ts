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

export const suggestionKindSchema = z.enum([
  'CATALOG_PRICE',
  'CATALOG_COMPARE',
  'CATALOG_SPEC',
  'CATALOG_BROWSE',
  'FINANCE',
  'TEST_DRIVE',
  'ACCESSORY',
  'KNOWLEDGE_POLICY',
  'CLARIFICATION',
  'FOLLOW_UP',
])
export type SuggestionKind = z.infer<typeof suggestionKindSchema>

export const salesAgentSuggestionSchema = z.object({
  suggestionId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  payload: z.string().trim().optional(),
  kind: suggestionKindSchema.optional(),
  entityIds: z.array(z.string().trim().min(1)).max(4).optional(),
  entityType: productTypeSchema.optional(),
  catalogVersion: z.number().int().nonnegative().optional(),
})
export type SalesAgentSuggestion = z.infer<typeof salesAgentSuggestionSchema>
