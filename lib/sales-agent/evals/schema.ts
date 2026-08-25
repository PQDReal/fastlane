import { z } from 'zod'

export const EvalIntentSchema = z.enum([
  'FACT_LOOKUP',
  'PROCEDURE',
  'POLICY_CONDITIONS',
  'COMPARISON',
  'MULTI_HOP',
  'AMBIGUOUS',
  'UNANSWERABLE',
  'VERSION_LIFECYCLE',
])
export type EvalIntent = z.infer<typeof EvalIntentSchema>

export const EvalDifficultySchema = z.enum(['EASY', 'MEDIUM', 'HARD'])
export type EvalDifficulty = z.infer<typeof EvalDifficultySchema>

export const EvalExpectedBehaviorSchema = z.enum(['ANSWER', 'CLARIFY', 'ABSTAIN', 'DELEGATE_TOOL'])
export type EvalExpectedBehavior = z.infer<typeof EvalExpectedBehaviorSchema>

export const EvalSplitSchema = z.enum(['dev', 'test-hidden', 'regression'])
export type EvalSplit = z.infer<typeof EvalSplitSchema>

export const EvalCitationAnchorSchema = z.object({
  documentKey: z.string().min(1, 'documentKey không được để trống'),
  version: z.number().int().positive().nullable().optional(),
  sectionAnchor: z.string().min(1, 'sectionAnchor không được để trống'),
  relevance: z.number().int().min(0).max(3),
})
export type EvalCitationAnchor = z.infer<typeof EvalCitationAnchorSchema>

export const EvalGoldSchema = z.object({
  requiredFacts: z.array(z.string().min(1)),
  forbiddenFacts: z.array(z.string().min(1)),
  expectedCitations: z.array(EvalCitationAnchorSchema),
  forbiddenVersions: z.array(z.string()),
  expectedClarificationFields: z.array(z.string()),
  abstainReason: z.string().optional(),
})
export type EvalGold = z.infer<typeof EvalGoldSchema>

export const EvalFiltersSchema = z.object({
  vehicleModel: z.string().nullable().optional(),
  modelYear: z.number().int().min(2020).max(2030).nullable().optional(),
  editionCode: z.string().nullable().optional(),
  category: z
    .enum(['WARRANTY_BATTERY', 'DEPOSIT_DELIVERY', 'TECHNICAL_GUIDE', 'PROMOTIONS_FINANCING'])
    .nullable()
    .optional(),
})
export type EvalFilters = z.infer<typeof EvalFiltersSchema>

export const EvalServerContextSchema = z.object({
  locale: z.string().default('vi-VN'),
  market: z.string().default('VN'),
  effectiveAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T/)),
})
export type EvalServerContext = z.infer<typeof EvalServerContextSchema>

export const EvalCaseSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id phải ở định dạng kebab-case'),
    query: z.string().min(3).max(500),
    intent: EvalIntentSchema,
    difficulty: EvalDifficultySchema,
    expectedBehavior: EvalExpectedBehaviorSchema,
    split: EvalSplitSchema,
    serverContext: EvalServerContextSchema,
    filters: EvalFiltersSchema,
    gold: EvalGoldSchema,
    tags: z.array(z.string()),
    notes: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    // Validate semantic integrity based on expectedBehavior
    if (val.expectedBehavior === 'ANSWER') {
      const hasRequiredCitation = val.gold.expectedCitations.some((c) => c.relevance === 3)
      if (!hasRequiredCitation && val.gold.expectedCitations.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Trường hợp ANSWER có trích dẫn phải chứa ít nhất 1 citation có relevance=3 (Required)',
          path: ['gold', 'expectedCitations'],
        })
      }
    }

    if (val.expectedBehavior === 'CLARIFY') {
      if (!val.gold.expectedClarificationFields || val.gold.expectedClarificationFields.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Trường hợp CLARIFY bắt buộc phải có ít nhất 1 trường trong expectedClarificationFields',
          path: ['gold', 'expectedClarificationFields'],
        })
      }
    }

    if (val.expectedBehavior === 'ABSTAIN') {
      if (!val.gold.abstainReason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Trường hợp ABSTAIN bắt buộc phải có lý do trong abstainReason',
          path: ['gold', 'abstainReason'],
        })
      }
    }
  })

export type EvalCase = z.infer<typeof EvalCaseSchema>

export function validateEvalCase(data: unknown): { success: true; data: EvalCase } | { success: false; errors: z.ZodError } {
  const result = EvalCaseSchema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, errors: result.error }
}

export function parseEvalDatasetJsonl(jsonlContent: string): { validCases: EvalCase[]; invalidCount: number; errors: { line: number; error: string }[] } {
  const lines = jsonlContent.split('\n').filter((l) => l.trim().length > 0)
  const validCases: EvalCase[] = []
  const errors: { line: number; error: string }[] = []

  lines.forEach((line, index) => {
    try {
      const parsed = JSON.parse(line)
      const validation = validateEvalCase(parsed)
      if (validation.success) {
        validCases.push(validation.data)
      } else {
        errors.push({
          line: index + 1,
          error: validation.errors.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        })
      }
    } catch (err: any) {
      errors.push({ line: index + 1, error: `Invalid JSON syntax: ${err?.message}` })
    }
  })

  return {
    validCases,
    invalidCount: errors.length,
    errors,
  }
}
