import { z } from 'zod'
import { navigationIntentV2Schema, salesAgentActionV2Schema, salesAgentSuggestionV2Schema, suggestionIntentSchema } from './action-v2'
import { interactionIntentV2Schema, salesAgentInteractionV2Schema } from './interaction-v2'
import { productTypeV2Schema } from './turn-v2'

export const entityKindSchema = z.enum([
  'PRODUCT',
  'VARIANT',
  'PROMOTION',
  'ACCESSORY_CATEGORY',
  'KNOWLEDGE_CHUNK',
])
export type EntityKind = z.infer<typeof entityKindSchema>

export const factPointerV2Schema = z.object({
  factRef: z.string().trim().min(1),
  evidenceId: z.string().trim().min(1),
  entityKind: entityKindSchema,
  entityId: z.string().trim().min(1),
  factPath: z.string().trim().min(1),
})
export type FactPointerV2 = z.infer<typeof factPointerV2Schema>

export const toolDataProjectionSchema = z.enum([
  'PRODUCT_LIST',
  'PRODUCT_DETAILS',
  'COMPARISON',
  'PROMOTIONS',
  'ACCESSORIES',
  'CITATIONS',
])
export type ToolDataProjection = z.infer<typeof toolDataProjectionSchema>

export const toolDataRefV2Schema = z.object({
  toolCallId: z.string().trim().min(1),
  resultRef: z.string().trim().min(1),
  projection: toolDataProjectionSchema,
})
export type ToolDataRefV2 = z.infer<typeof toolDataRefV2Schema>

export const toolObservationRefV2Schema = z.object({
  observationId: z.string().trim().min(1),
  toolCallId: z.string().trim().min(1),
  outcome: z.enum(['SUCCESS', 'NO_MATCH', 'NEEDS_INPUT', 'REJECTED', 'UNAVAILABLE']),
  issueCodes: z.array(z.string().trim()),
  inputHash: z.string().trim().min(1),
  readAt: z.string().datetime(),
})
export type ToolObservationRefV2 = z.infer<typeof toolObservationRefV2Schema>

export const knownEntityRefV2Schema = z.object({
  kind: z.enum(['PRODUCT', 'ACCESSORY_CATEGORY', 'PROMOTION']),
  id: z.string().trim().min(1),
})
export type KnownEntityRefV2 = z.infer<typeof knownEntityRefV2Schema>

export const plannedNarrativeItemV2Schema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('FASTLANE_FACT'),
    presentationKey: z.enum([
      'FACT_SENTENCE',
      'FACT_SUMMARY',
      'PRICE_RANGE',
      'COMPARISON_SUMMARY',
    ]),
    facts: z.array(factPointerV2Schema).min(1),
  }),
  z.object({
    kind: z.literal('ADVICE'),
    markdown: z.string().trim().min(1),
    subjects: z.array(knownEntityRefV2Schema).optional(),
    support: z.array(factPointerV2Schema).optional(),
  }),
  z.object({
    kind: z.literal('LIMITATION'),
    observations: z.array(toolObservationRefV2Schema).min(1),
  }),
])
export type PlannedNarrativeItemV2 = z.infer<typeof plannedNarrativeItemV2Schema>

export const agentResponsePlanV2Schema = z.object({
  schemaVersion: z.literal('2.0'),
  outcome: z.enum(['ANSWER', 'REQUIRES_INPUT', 'DEGRADED']),
  narrative: z.array(plannedNarrativeItemV2Schema),
  views: z.array(
    z.object({
      kind: z.enum([
        'PRODUCT_LIST',
        'PRODUCT_DETAILS',
        'COMPARISON_TABLE',
        'PROMOTION_LIST',
        'ACCESSORY_LIST',
        'CITATION_LIST',
      ]),
      source: toolDataRefV2Schema,
    }),
  ).default([]),
  suggestionIntents: z.array(suggestionIntentSchema).default([]),
  actionIntents: z.array(navigationIntentV2Schema).default([]),
  interactionIntent: interactionIntentV2Schema.optional(),
})
export type AgentResponsePlanV2 = z.infer<typeof agentResponsePlanV2Schema>

export const assistantBlockV2Schema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('PRODUCT_LIST'),
    items: z.array(z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      url: z.string(),
      productType: productTypeV2Schema,
      price: z.number().nullable(),
      facts: z.record(z.string(), z.string()).optional(),
    })),
  }),
  z.object({
    kind: z.literal('PRODUCT_DETAILS'),
    product: z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      url: z.string(),
      productType: productTypeV2Schema,
      price: z.number().nullable(),
      description: z.string().nullable().optional(),
      specs: z.record(z.string(), z.any()).optional(),
      variants: z.array(z.any()).optional(),
    }),
  }),
  z.object({
    kind: z.literal('COMPARISON_TABLE'),
    headers: z.array(z.string()),
    rows: z.array(z.object({
      criterion: z.string(),
      values: z.array(z.string().nullable()),
    })),
  }),
  z.object({
    kind: z.literal('PROMOTION_LIST'),
    promotions: z.array(z.object({
      id: z.string(),
      title: z.string(),
      description: z.string().nullable().optional(),
      discountAmount: z.number().nullable().optional(),
      discountPercent: z.number().nullable().optional(),
      applicableProductTypes: z.array(productTypeV2Schema).optional(),
    })),
  }),
  z.object({
    kind: z.literal('ACCESSORY_LIST'),
    accessories: z.array(z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      url: z.string(),
      price: z.number().nullable(),
      compatibility: z.string().optional(),
    })),
  }),
  z.object({
    kind: z.literal('FACT_SUMMARY'),
    title: z.string(),
    items: z.array(z.object({
      label: z.string(),
      value: z.string(),
      factRef: z.string().optional(),
    })),
  }),
  z.object({
    kind: z.literal('NOTICE'),
    severity: z.enum(['INFO', 'WARNING', 'ERROR']),
    code: z.string(),
    message: z.string(),
  }),
])
export type AssistantBlockV2 = z.infer<typeof assistantBlockV2Schema>

export const turnViewModelV2Schema = z.object({
  schemaVersion: z.literal('2.0'),
  conversationRef: z.string(),
  turnId: z.string(),
  messageId: z.string(),
  answer: z.object({
    markdown: z.string(),
    completeness: z.enum(['COMPLETE', 'PARTIAL', 'NO_EVIDENCE']),
  }),
  blocks: z.array(assistantBlockV2Schema).default([]),
  actions: z.array(salesAgentActionV2Schema).default([]),
  suggestions: z.array(salesAgentSuggestionV2Schema).default([]),
  interaction: salesAgentInteractionV2Schema.optional(),
  grounding: z.object({
    dataAsOf: z.string().optional(),
    warnings: z.array(z.object({
      code: z.string(),
      message: z.string(),
    })).default([]),
  }),
})
export type TurnViewModelV2 = z.infer<typeof turnViewModelV2Schema>
