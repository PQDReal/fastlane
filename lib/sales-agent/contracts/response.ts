import { z } from 'zod'
import { navigationIntentSchema, salesAgentActionSchema, salesAgentSuggestionSchema, suggestionIntentSchema } from './action'
import { interactionIntentSchema, salesAgentInteractionSchema } from './interaction'

export const factPointerSchema = z.object({
  factRef: z.string().trim().min(1),
  evidenceId: z.string().trim().min(1),
  entityKind: z.enum(['PRODUCT', 'PROMOTION', 'KNOWLEDGE_SNIPPET', 'ORDER']),
  entityId: z.string().trim().min(1),
  factPath: z.string().trim().min(1),
})
export type FactPointer = z.infer<typeof factPointerSchema>

export const toolDataRefSchema = z.object({
  toolCallId: z.string().trim().min(1),
  path: z.string().trim().min(1),
  summary: z.string().trim().optional(),
})
export type ToolDataRef = z.infer<typeof toolDataRefSchema>

export const toolObservationRefSchema = z.object({
  observationId: z.string().trim().min(1),
  toolCallId: z.string().trim().min(1),
  outcome: z.enum(['SUCCESS', 'NO_MATCH', 'NEEDS_INPUT', 'REJECTED', 'UNAVAILABLE']),
  issueCodes: z.array(z.string()).default([]),
  inputHash: z.string().trim().min(1),
  readAt: z.string().datetime(),
})
export type ToolObservationRef = z.infer<typeof toolObservationRefSchema>

export const plannedNarrativeItemSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('FASTLANE_FACT'),
    presentationKey: z.enum(['FACT_SENTENCE', 'FACT_BULLET', 'FACT_SUMMARY']),
    facts: z.array(factPointerSchema).min(1),
  }),
  z.object({
    kind: z.literal('ADVICE'),
    markdown: z.string().trim().min(1),
    subjects: z.array(z.object({ kind: z.string(), id: z.string() })).optional(),
    support: z.array(factPointerSchema).optional(),
  }),
  z.object({
    kind: z.literal('LIMITATION'),
    observations: z.array(toolObservationRefSchema).min(1),
  }),
  z.object({
    kind: z.literal('POLICY'),
    code: z.string().trim().min(1),
    statement: z.string().trim().min(1),
  }),
])
export type PlannedNarrativeItem = z.infer<typeof plannedNarrativeItemSchema>

export const plannedViewItemSchema = z.object({
  viewKey: z.enum([
    'PRODUCT_GRID',
    'PRODUCT_DETAILS',
    'COMPARISON_TABLE',
    'PROMOTION_CARDS',
    'ACCESSORY_CARDS',
    'INTERACTION_CHOICE',
  ]),
  title: z.string().trim().optional(),
  dataRefs: z.array(toolDataRefSchema).min(1),
  interactionIntent: interactionIntentSchema.optional(),
})
export type PlannedViewItem = z.infer<typeof plannedViewItemSchema>

export const agentResponsePlanSchema = z.object({
  schemaVersion: z.literal('2.0').default('2.0'),
  outcome: z.enum(['ANSWER', 'NEEDS_INPUT', 'DEGRADED', 'REFUSAL']),
  narrative: z.array(plannedNarrativeItemSchema).min(1),
  views: z.array(plannedViewItemSchema).default([]),
  suggestionIntents: z.array(suggestionIntentSchema).max(3).default([]),
  actionIntents: z.array(navigationIntentSchema).max(2).default([]),
  interactionIntent: interactionIntentSchema.optional(),
})
export type AgentResponsePlan = z.infer<typeof agentResponsePlanSchema>

export const assistantBlockSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('PRODUCT_LIST'),
    title: z.string().optional(),
    items: z.array(z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      productType: z.string(),
      thumbnailUrl: z.string().optional(),
      price: z.number().nullable().optional(),
      summary: z.string().optional(),
      url: z.string(),
    })),
  }),
  z.object({
    kind: z.literal('PRODUCT_DETAILS'),
    productId: z.string(),
    name: z.string(),
    slug: z.string(),
    productType: z.string(),
    thumbnailUrl: z.string().optional(),
    price: z.number().nullable().optional(),
    specs: z.record(z.string(), z.string()).optional(),
    url: z.string(),
  }),
  z.object({
    kind: z.literal('COMPARISON_TABLE'),
    criteria: z.array(z.string()),
    products: z.array(z.object({
      productId: z.string(),
      name: z.string(),
      thumbnailUrl: z.string().optional(),
      values: z.record(z.string(), z.string()),
    })),
  }),
  z.object({
    kind: z.literal('PROMOTION_LIST'),
    items: z.array(z.object({
      id: z.string(),
      title: z.string(),
      discountValue: z.string().optional(),
      validUntil: z.string().optional(),
      url: z.string().optional(),
    })),
  }),
  z.object({
    kind: z.literal('ACCESSORY_LIST'),
    items: z.array(z.object({
      id: z.string(),
      name: z.string(),
      price: z.number().nullable().optional(),
      thumbnailUrl: z.string().optional(),
      compatibility: z.string().optional(),
      url: z.string(),
    })),
  }),
  z.object({
    kind: z.literal('FACT_SUMMARY'),
    facts: z.array(z.object({
      label: z.string(),
      value: z.string(),
    })),
  }),
  z.object({
    kind: z.literal('NOTICE'),
    tone: z.enum(['INFO', 'WARNING', 'LIMITATION']),
    message: z.string(),
  }),
])
export type AssistantBlock = z.infer<typeof assistantBlockSchema>

export const turnViewModelSchema = z.object({
  schemaVersion: z.literal('2.0').default('2.0'),
  conversationRef: z.string().trim().min(1),
  turnId: z.string().trim().min(1),
  messageId: z.string().trim().min(1),
  answer: z.object({
    markdown: z.string().trim().min(1),
    completeness: z.enum(['COMPLETE', 'PARTIAL', 'NO_EVIDENCE']),
  }),
  blocks: z.array(assistantBlockSchema).default([]),
  actions: z.array(salesAgentActionSchema).default([]),
  suggestions: z.array(salesAgentSuggestionSchema).default([]),
  interaction: salesAgentInteractionSchema.optional(),
  grounding: z.object({
    dataAsOf: z.string().datetime(),
    warnings: z.array(z.object({ code: z.string(), message: z.string() })).default([]),
  }),
})
export type TurnViewModel = z.infer<typeof turnViewModelSchema>
