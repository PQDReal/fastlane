import { z } from 'zod'

export const salesAgentRunBudgetSchema = z.object({
  version: z.string().default('2.0'),
  maxModelSteps: z.number().int().min(1).max(10).default(4),
  maxToolCalls: z.number().int().min(1).max(20).default(8),
  maxToolCallsPerStep: z.number().int().min(1).max(10).default(4),
  maxConcurrentTools: z.number().int().min(1).max(5).default(2),
  totalTimeoutMs: z.number().int().min(1000).max(60000).default(35000),
  modelStepTimeoutMs: z.number().int().min(1000).max(45000).default(25000),
  toolTimeoutMs: z.number().int().min(500).max(30000).default(8000),
  maxOutputTokens: z.number().int().min(100).max(4096).default(1200),
  maxHistoryTurns: z.number().int().min(1).max(20).default(6),
})

export type SalesAgentRunBudget = z.infer<typeof salesAgentRunBudgetSchema>

export const DEFAULT_V2_RUN_BUDGET: SalesAgentRunBudget = {
  version: '2.0',
  maxModelSteps: 4,
  maxToolCalls: 8,
  maxToolCallsPerStep: 4,
  maxConcurrentTools: 2,
  totalTimeoutMs: 35000,
  modelStepTimeoutMs: 25000,
  toolTimeoutMs: 8000,
  maxOutputTokens: 1200,
  maxHistoryTurns: 6,
}
