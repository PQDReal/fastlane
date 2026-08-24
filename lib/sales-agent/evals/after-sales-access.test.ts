import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { DATA_TOOL_NAMES } from '../contracts'
import cases from './fixtures/after-sales-access.json'

const root = process.cwd()
const toolContractSource = readFileSync(join(root, 'lib/sales-agent/contracts/tool.ts'), 'utf8')
const cacheSource = readFileSync(join(root, 'lib/sales-agent/cache/catalog-cache.ts'), 'utf8')
const repositorySource = readFileSync(join(root, 'lib/sales-agent/knowledge/repository.ts'), 'utf8')
const manualMigrationSource = readFileSync(join(root, 'migrations/061_update_embedding_dimensions.sql'), 'utf8')

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
    expect(cases.filter((item) => item.query)).toHaveLength(8)
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

  it('freezes the two infrastructure limits observed during the audit', () => {
    expect(cacheSource).toContain('.limit(200)')
    expect(repositorySource).toContain("openai.embedding('text-embedding-3-small')")
    expect(repositorySource).not.toContain('dimensions: 512')
    expect(manualMigrationSource).toContain('vector(512)')
  })

  it('keeps current verdicts explicit instead of treating missing evidence as a pass', () => {
    expect(cases.filter((item) => item.currentStatus === 'PASS')).toHaveLength(7)
    expect(cases.filter((item) => item.currentStatus === 'PARTIAL')).toHaveLength(0)
    expect(cases.filter((item) => item.currentStatus === 'FAIL').map((item) => item.id)).toEqual([
      'vf8-manual-charge-port',
    ])
    expect(cases.find((item) => item.flow === 'official_pdf')?.currentStatus).toBe('LINK_ONLY')
  })
})
