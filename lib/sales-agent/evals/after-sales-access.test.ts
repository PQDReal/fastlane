import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { DATA_TOOL_NAMES } from '../contracts'
import cases from './fixtures/after-sales-access.json'

const root = process.cwd()
const toolContractSource = readFileSync(join(root, 'lib/sales-agent/contracts/tool.ts'), 'utf8')
const cacheSource = readFileSync(join(root, 'lib/sales-agent/cache/catalog-cache.ts'), 'utf8')
const repositorySource = readFileSync(join(root, 'lib/sales-agent/knowledge/repository.ts'), 'utf8')
const embedderSource = readFileSync(join(root, 'lib/sales-agent/knowledge/manual-embedder.ts'), 'utf8')
const manualMigrationSource = readFileSync(join(root, 'migrations/061_update_embedding_dimensions.sql'), 'utf8')
const auditSource = readFileSync(join(root, 'scripts/audit-sales-agent-after-sales-state.mjs'), 'utf8')

describe('Sales Agent after-sales access audit snapshot', () => {
  it('covers every public after-sales flow plus the current PDF-link boundary', () => {
    expect(new Set(cases.map((item) => item.flow))).toEqual(new Set([
      'warranty',
      'maintenance',
      'repair',
      'rescue',
      'workshop',
      'manual',
      'official_pdf',
    ]))
    expect(cases.filter((item) => item.query)).toHaveLength(9)
  })

  it('records typed access to published facts and service locations', () => {
    expect(DATA_TOOL_NAMES).toContain('search_knowledge')
    expect(DATA_TOOL_NAMES).toContain('search_user_manuals')
    expect(DATA_TOOL_NAMES).toContain('search_after_sales')
    expect(DATA_TOOL_NAMES).toContain('find_service_locations')
    expect(toolContractSource).toContain("'search_after_sales'")
    expect(toolContractSource).toContain("'find_service_locations'")

    expect(cases.filter((item) => ['maintenance', 'repair', 'rescue'].includes(item.flow))
      .every((item) => item.expectedTool === 'search_after_sales')).toBe(true)
    expect(cases.find((item) => item.flow === 'workshop')?.expectedTool).toBe('find_service_locations')
  })

  it('keeps the manual query and ingestion dimensions aligned with pgvector', () => {
    expect(cacheSource).toContain('.limit(200)')
    expect(repositorySource).toContain("openai.embedding('text-embedding-3-small', { dimensions: 512 })")
    expect(embedderSource).toContain("openai.embedding('text-embedding-3-small', { dimensions: 512 })")
    expect(manualMigrationSource).toContain('vector(512)')
  })

  it('records the repaired live verdict while keeping the PDF boundary explicit', () => {
    expect(cases.filter((item) => item.currentStatus === 'PASS')).toHaveLength(9)
    expect(cases.filter((item) => item.currentStatus === 'PARTIAL')).toHaveLength(0)
    expect(cases.filter((item) => item.currentStatus === 'FAIL')).toHaveLength(0)
    expect(cases.find((item) => item.flow === 'official_pdf')?.currentStatus).toBe('LINK_ONLY')
  })

  it('defines machine-verifiable live gates for every query case', () => {
    const queryCases = cases.filter((item) => item.query)
    expect(queryCases.every((item) => ['COMPLETE', 'PARTIAL'].includes(item.expectedCompleteness ?? ''))).toBe(true)
    expect(queryCases.find((item) => item.id === 'klara-s-official-manual')?.expectedCompleteness).toBe('PARTIAL')
    expect(cases.find((item) => item.id === 'klara-s-official-manual')?.forbiddenAnswerTerms).toContain('đời năm nào')
    expect(queryCases.every((item) => (item.requiredAnswerTermGroups ?? []).length > 0)).toBe(true)
    expect(queryCases.every((item) => (item.forbiddenAnswerTerms ?? []).includes('suggestionIntents'))).toBe(true)
    expect(auditSource).toContain("process.argv.includes('--assert')")
    expect(auditSource).toContain('process.exitCode = 1')
    expect(auditSource).toContain('queryEmbeddingDimensions === 512')
    expect(auditSource).toContain('manualRetrievalPass')
  })
})
