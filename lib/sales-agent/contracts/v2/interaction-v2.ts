import { z } from 'zod'
import { productTypeV2Schema } from './turn-v2'

export const interactionSlotSchema = z.enum(['vehicles', 'vehicle', 'criteria', 'budget', 'usage', 'general'])
export type InteractionSlot = z.infer<typeof interactionSlotSchema>

export const interactionOptionV2Schema = z.object({
  optionId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  value: z.string().trim().min(1),
  description: z.string().trim().optional(),
  kind: z.enum(['product', 'allowlist']).default('allowlist'),
  entityId: z.string().trim().optional(),
  entityType: productTypeV2Schema.optional(),
})
export type InteractionOptionV2 = z.infer<typeof interactionOptionV2Schema>

export const salesAgentInteractionV2Schema = z.object({
  interactionId: z.string().trim().min(1),
  slot: interactionSlotSchema,
  mode: z.enum(['single', 'multiple']).default('single'),
  title: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  options: z.array(interactionOptionV2Schema),
  minSelections: z.number().int().min(1).default(1),
  maxSelections: z.number().int().min(1).default(1),
  allowFreeText: z.boolean().default(false),
  productType: productTypeV2Schema.optional(),
  continuationToken: z.string().trim().min(1),
  expiresAt: z.string().datetime().optional(),
})
export type SalesAgentInteractionV2 = z.infer<typeof salesAgentInteractionV2Schema>

export const interactionIntentV2Schema = z.object({
  slot: interactionSlotSchema,
  mode: z.enum(['single', 'multiple']).optional(),
  minSelections: z.number().int().min(1).optional(),
  maxSelections: z.number().int().min(1).optional(),
  allowFreeText: z.boolean().optional(),
  productType: productTypeV2Schema.optional(),
  candidateIds: z.array(z.string().trim()).optional(),
})
export type InteractionIntentV2 = z.infer<typeof interactionIntentV2Schema>
