import { z } from 'zod'

export const salesAgentRunBudgetSchema = z.object({
  maxModelSteps: z.number().int().min(1).max(6).default(4),
  maxToolCalls: z.number().int().min(1).max(12).default(8),
  maxOutputTokens: z.number().int().min(100).max(4000).default(1200),
  finalResponseTokens: z.number().int().min(100).max(2000).default(400),
  maxHistoryTurns: z.number().int().min(1).max(20).default(8),
  stepTimeoutMs: z.number().int().min(1000).max(30000).default(12000),
  toolTimeoutMs: z.number().int().min(1000).max(30000).default(8000),
  totalTimeoutMs: z.number().int().min(5000).max(60000).default(35000),
}).refine((budget) => budget.finalResponseTokens <= budget.maxOutputTokens, {
  message: 'finalResponseTokens không được vượt quá maxOutputTokens.',
  path: ['finalResponseTokens'],
})

export type SalesAgentRunBudget = z.infer<typeof salesAgentRunBudgetSchema>

export const DEFAULT_RUN_BUDGET: SalesAgentRunBudget = {
  maxModelSteps: 4,
  maxToolCalls: 8,
  maxOutputTokens: 1200,
  finalResponseTokens: 400,
  maxHistoryTurns: 8,
  stepTimeoutMs: 12000,
  toolTimeoutMs: 8000,
  totalTimeoutMs: 35000,
}
