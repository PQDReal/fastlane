import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { parseEvalDatasetJsonl, validateEvalCase } from './schema'

const datasetPath = path.resolve('.local/tasks/sales-agent-knowledge-rag-upgrade-019/eval-dataset.v1.jsonl')
const describeDataset = fs.existsSync(datasetPath) ? describe : describe.skip

describeDataset('Eval Dataset v1 (120 cases) Integrity & Contract Test (A19-KR-006)', () => {

  it('verifies that the dataset file exists and has 120 non-empty lines', () => {
    expect(fs.existsSync(datasetPath)).toBe(true)
    const rawContent = fs.readFileSync(datasetPath, 'utf-8')
    const lines = rawContent.split('\n').filter((l) => l.trim().length > 0)
    expect(lines.length).toBe(120)
  })

  it('validates 100% of cases against EvalCase schema without errors', () => {
    const rawContent = fs.readFileSync(datasetPath, 'utf-8')
    const { validCases, invalidCount, errors } = parseEvalDatasetJsonl(rawContent)

    if (errors.length > 0) {
      console.error('Validation errors found in eval-dataset.v1.jsonl:', errors)
    }

    expect(invalidCount).toBe(0)
    expect(validCases.length).toBe(120)
  })

  it('asserts strictly unique kebab-case IDs across all 120 cases', () => {
    const rawContent = fs.readFileSync(datasetPath, 'utf-8')
    const { validCases } = parseEvalDatasetJsonl(rawContent)
    const ids = validCases.map((c) => c.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(120)
  })

  it('asserts exact required split distribution (70 dev / 30 test-hidden / 20 regression)', () => {
    const rawContent = fs.readFileSync(datasetPath, 'utf-8')
    const { validCases } = parseEvalDatasetJsonl(rawContent)

    const splits = { dev: 0, 'test-hidden': 0, regression: 0 }
    validCases.forEach((c) => {
      splits[c.split]++
    })

    expect(splits.dev).toBe(70)
    expect(splits['test-hidden']).toBe(30)
    expect(splits.regression).toBe(20)
  })

  it('asserts exact intent taxonomy distribution across 8 categories', () => {
    const rawContent = fs.readFileSync(datasetPath, 'utf-8')
    const { validCases } = parseEvalDatasetJsonl(rawContent)

    const intents: Record<string, number> = {}
    validCases.forEach((c) => {
      intents[c.intent] = (intents[c.intent] || 0) + 1
    })

    expect(intents.FACT_LOOKUP).toBe(25)
    expect(intents.PROCEDURE).toBe(20)
    expect(intents.POLICY_CONDITIONS).toBe(15)
    expect(intents.COMPARISON).toBe(15)
    expect(intents.MULTI_HOP).toBe(15)
    expect(intents.AMBIGUOUS).toBe(10)
    expect(intents.UNANSWERABLE).toBe(10)
    expect(intents.VERSION_LIFECYCLE).toBe(10)
  })

  it('verifies semantic contracts for expected behaviors', () => {
    const rawContent = fs.readFileSync(datasetPath, 'utf-8')
    const { validCases } = parseEvalDatasetJsonl(rawContent)

    validCases.forEach((c) => {
      if (c.expectedBehavior === 'ANSWER') {
        expect(c.gold.expectedCitations.length).toBeGreaterThan(0)
        expect(c.gold.expectedCitations.some((cite) => cite.relevance === 3)).toBe(true)
      } else if (c.expectedBehavior === 'CLARIFY') {
        expect(c.gold.expectedClarificationFields.length).toBeGreaterThan(0)
      } else if (c.expectedBehavior === 'ABSTAIN') {
        expect(c.gold.abstainReason).toBeDefined()
        expect(c.gold.abstainReason?.length).toBeGreaterThan(5)
      }
    })
  })
})
