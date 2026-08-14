import { z } from 'zod'
import { productTypeV2Schema } from './turn-v2'

export const navigationActionKeySchema = z.enum([
  'BROWSE_CATALOG',
  'VIEW_PRODUCT',
  'OPEN_COMPARE',
  'OPEN_PROMOTIONS',
  'DISCOVER_ACCESSORIES',
  'CONSULT_AGENT',
])
export type NavigationActionKey = z.infer<typeof navigationActionKeySchema>

export const navigationIntentV2Schema = z.object({
  actionKey: navigationActionKeySchema,
  entityId: z.string().trim().optional(),
  entityType: productTypeV2Schema.optional(),
  parameters: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
})
export type NavigationIntentV2 = z.infer<typeof navigationIntentV2Schema>

export const salesAgentActionV2Schema = z.object({
  actionId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  kind: z.enum(['PRIMARY', 'SECONDARY', 'DISMISSIBLE']).default('PRIMARY'),
  target: z.object({
    type: z.enum(['ROUTE', 'EXTERNAL']).default('ROUTE'),
    href: z.string().trim().min(1),
  }),
  actionKey: navigationActionKeySchema,
  entityId: z.string().trim().optional(),
})
export type SalesAgentActionV2 = z.infer<typeof salesAgentActionV2Schema>

export const suggestionIntentSchema = z.object({
  text: z.string().trim().min(1).max(200),
  category: z.enum(['FOLLOW_UP', 'EXPLORE', 'COMPARE', 'PROMOTION', 'ACCESSORY']).optional(),
})
export type SuggestionIntent = z.infer<typeof suggestionIntentSchema>

export const salesAgentSuggestionV2Schema = z.object({
  suggestionId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  payload: z.string().trim().min(1),
  continuationToken: z.string().trim().optional(),
})
export type SalesAgentSuggestionV2 = z.infer<typeof salesAgentSuggestionV2Schema>
