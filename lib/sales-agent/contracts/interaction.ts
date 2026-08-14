import { z } from 'zod'
import { productTypeSchema } from './turn'

export const interactionOptionSchema = z.object({
  optionId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  description: z.string().trim().optional(),
  recommended: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type InteractionOption = z.infer<typeof interactionOptionSchema>

export const salesAgentInteractionSchema = z.object({
  interactionId: z.string().trim().min(1),
  kind: z.literal('CHOICE'),
  slot: z.string().trim().min(1),
  mode: z.enum(['SINGLE', 'MULTIPLE']).default('SINGLE'),
  productType: productTypeSchema.optional(),
  title: z.string().trim().min(1),
  description: z.string().trim().optional(),
  minSelections: z.number().int().min(0).default(1),
  maxSelections: z.number().int().min(1).default(1),
  allowFreeText: z.boolean().default(false),
  submitLabel: z.string().trim().min(1).default('Xác nhận'),
  options: z.array(interactionOptionSchema).min(1).max(8),
  continuationToken: z.string().trim().min(1),
  expiresAt: z.string().datetime(),
})
export type SalesAgentInteraction = z.infer<typeof salesAgentInteractionSchema>

export const SALES_AGENT_INTERACTION_VISIBLE_OPTIONS = 4

export function getVisibleSalesAgentInteractionOptions(
  options: InteractionOption[],
  selectedOptionIds: string[],
  expanded: boolean,
) {
  if (expanded || options.length <= SALES_AGENT_INTERACTION_VISIBLE_OPTIONS) {
    return options
  }
  const selected = options.filter((option) => selectedOptionIds.includes(option.optionId))
  const unselected = options.filter((option) => !selectedOptionIds.includes(option.optionId))
  return [...selected, ...unselected].slice(0, SALES_AGENT_INTERACTION_VISIBLE_OPTIONS)
}

export const interactionIntentSchema = z.object({
  slot: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  mode: z.enum(['SINGLE', 'MULTIPLE']).default('SINGLE'),
  candidates: z.array(z.string().trim().min(1)).min(1).max(8),
  allowFreeText: z.boolean().default(false),
})
export type InteractionIntent = z.infer<typeof interactionIntentSchema>
