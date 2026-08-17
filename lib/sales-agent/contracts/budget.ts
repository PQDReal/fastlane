import { z } from 'zod'

export const salesAgentRunBudgetSchema = z.object({
  maxModelSteps: z.number().int().min(1).max(6).default(4),
  maxToolCalls: z.number().int().min(1).max(12).default(8),
  maxOutputTokens: z.number().int().min(100).max(4000).default(1200),
  maxHistoryTurns: z.number().int().min(1).max(20).default(8),
  stepTimeoutMs: z.number().int().min(1000).max(30000).default(12000),
  totalTimeoutMs: z.number().int().min(5000).max(60000).default(35000),
})

export type SalesAgentRunBudget = z.infer<typeof salesAgentRunBudgetSchema>

export const DEFAULT_RUN_BUDGET: SalesAgentRunBudget = {
  maxModelSteps: 4,
  maxToolCalls: 8,
  maxOutputTokens: 1200,
  maxHistoryTurns: 8,
  stepTimeoutMs: 12000,
  totalTimeoutMs: 35000,
}
