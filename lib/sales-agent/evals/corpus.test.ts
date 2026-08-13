import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ resolveVehicles: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('../catalog/context', () => ({ resolveSalesAgentVehicleReferences: mocks.resolveVehicles }))

import { planSalesAgentTools } from '../tools/planner'
import {
  SALES_AGENT_EVAL_CATEGORIES,
  SALES_AGENT_EVAL_CORPUS,
  type SalesAgentEvalCategory,
} from './corpus'

describe('sales agent Vietnamese eval corpus', () => {
  beforeEach(() => vi.clearAllMocks())

  it('contains eight unique cases for every required category', () => {
    expect(SALES_AGENT_EVAL_CORPUS).toHaveLength(64)
    expect(new Set(SALES_AGENT_EVAL_CORPUS.map((item) => item.id)).size).toBe(64)
    expect(new Set(SALES_AGENT_EVAL_CORPUS.map((item) => item.prompt)).size).toBe(64)

    const counts = Object.fromEntries(SALES_AGENT_EVAL_CATEGORIES.map((category) => [category, 0])) as Record<SalesAgentEvalCategory, number>
    SALES_AGENT_EVAL_CORPUS.forEach((item) => { counts[item.category] += 1 })
    expect(counts).toEqual(Object.fromEntries(SALES_AGENT_EVAL_CATEGORIES.map((category) => [category, 8])))
  })

  it('marks procedure claims as citation-bound and failure cases as fail-closed', () => {
    const procedures = SALES_AGENT_EVAL_CORPUS.filter((item) => item.category === 'PROCEDURES_GUIDES')
    const failures = SALES_AGENT_EVAL_CORPUS.filter((item) => item.category === 'FAILURE_NO_ANSWER')
    expect(procedures.every((item) => item.requiresCitation && item.noAnswerWhenEvidenceMissing)).toBe(true)
    expect(failures.every((item) => item.noAnswerWhenEvidenceMissing)).toBe(true)
  })

  it.each(SALES_AGENT_EVAL_CORPUS)('$id selects the expected deterministic tool and navigation action', async (item) => {
    mocks.resolveVehicles.mockResolvedValue(item.resolvedVehicles)

    const plan = await planSalesAgentTools(item.prompt)

    expect(plan.calls[0]?.name ?? null).toBe(item.expectedTool)
    expect(plan.calls).toHaveLength(item.expectedTool ? 1 : 0)
    expect(plan.navigationIntent?.actionKey ?? null).toBe(item.expectedNavigation)
    expect(JSON.stringify(plan.navigationIntent ?? {})).not.toMatch(/href|url|pathname/i)
  })
})
