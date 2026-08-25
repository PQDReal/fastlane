import { z } from 'zod'
import { productTypeSchema, type ProductType } from './turn'

export const SALES_AGENT_INTERACTION_MAX_OPTIONS = 8
export const SALES_AGENT_INTERACTION_VISIBLE_OPTIONS = 4

export type SalesAgentInteractionSlot = 'vehicles' | 'vehicle' | 'criteria' | 'budget' | 'usage' | string
export type SalesAgentInteractionMode = 'SINGLE' | 'MULTIPLE' | 'single' | 'multiple'
export type SalesAgentInteractionProductType = ProductType
export type SalesAgentScopeField = 'vehicleModel' | 'modelYear'

export type SalesAgentInteractionResponse = {
  interactionId: string
  selectedOptionIds: string[]
  freeText?: string
  continuationToken: string
}

export type SalesAgentInteractionMetric = {
  interactionId?: string
  slot: string
  event?: 'display' | 'select' | 'submit' | 'expand' | 'more' | 'dismiss' | 'action' | 'recommendation_click' | string
  action?: string
  selectedCount?: number
  selectedOptionIds?: string[]
  resultCount?: number
  mode?: string
  timestamp?: string
  metadata?: Record<string, unknown>
}

export const interactionOptionSchema = z.object({
  optionId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  description: z.string().trim().optional(),
  recommended: z.boolean().optional(),
  /** Scope options are descriptive only; the signed continuation token is authoritative. */
  field: z.enum(['vehicleModel', 'modelYear']).optional(),
  value: z.string().trim().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type InteractionOption = z.infer<typeof interactionOptionSchema>

export const interactionFieldSchema = z.object({
  field: z.enum(['vehicleModel', 'modelYear']),
  label: z.string().trim().min(1),
  required: z.boolean().default(true),
  dependsOn: z.enum(['vehicleModel']).optional(),
  // Scope fields can contain the linked year options for every active model;
  // the UI filters these by the selected vehicleModel before rendering.
  options: z.array(interactionOptionSchema).min(1).max(64),
})
export type InteractionField = z.infer<typeof interactionFieldSchema>

export const salesAgentInteractionSchema = z.object({
  interactionId: z.string().trim().min(1),
  kind: z.literal('CHOICE'),
  slot: z.string().trim().min(1),
  mode: z.enum(['SINGLE', 'MULTIPLE', 'single', 'multiple'] as any).default('SINGLE'),
  productType: productTypeSchema.optional(),
  title: z.string().trim().min(1),
  description: z.string().trim().optional(),
  minSelections: z.number().int().min(0).default(1),
  maxSelections: z.number().int().min(1).default(1),
  allowFreeText: z.boolean().default(false),
  submitLabel: z.string().trim().min(1).default('Xác nhận'),
  options: z.array(interactionOptionSchema).min(1).max(8),
  fields: z.array(interactionFieldSchema).max(2).optional(),
  continuationToken: z.string().trim().min(1),
  expiresAt: z.string().datetime(),
})
export type SalesAgentInteraction = z.infer<typeof salesAgentInteractionSchema>

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

export function validateSalesAgentInteraction(value: unknown): SalesAgentInteraction {
  if (!value || typeof value !== 'object') throw new Error('Interaction phải là JSON object.')
  const input = value as any
  return {
    interactionId: String(input.interactionId || ''),
    kind: 'CHOICE',
    slot: String(input.slot || ''),
    mode: input.mode === 'MULTIPLE' || input.mode === 'multiple' ? 'MULTIPLE' : 'SINGLE',
    productType: input.productType,
    title: String(input.title || ''),
    description: input.description,
    minSelections: typeof input.minSelections === 'number' ? input.minSelections : 1,
    maxSelections: typeof input.maxSelections === 'number' ? input.maxSelections : 1,
    allowFreeText: Boolean(input.allowFreeText),
    submitLabel: String(input.submitLabel || 'Xác nhận'),
    options: Array.isArray(input.options) ? input.options : [],
    fields: Array.isArray(input.fields) ? input.fields : undefined,
    continuationToken: String(input.continuationToken || ''),
    expiresAt: String(input.expiresAt || new Date().toISOString()),
  }
}

export const interactionIntentSchema = z.object({
  slot: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  mode: z.enum(['SINGLE', 'MULTIPLE']).default('SINGLE'),
  candidates: z.array(z.string().trim().min(1)).min(1).max(8),
  allowFreeText: z.boolean().default(false),
})
export type InteractionIntent = z.infer<typeof interactionIntentSchema>
