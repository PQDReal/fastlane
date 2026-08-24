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

  it('records that only knowledge and manual search are exposed to the agent', () => {
    expect(DATA_TOOL_NAMES).toContain('search_knowledge')
    expect(DATA_TOOL_NAMES).toContain('search_user_manuals')
    expect(toolContractSource).not.toContain("'search_after_sales'")
    expect(toolContractSource).not.toContain("'list_service_workshops'")

    for (const flow of ['maintenance', 'repair', 'rescue', 'workshop']) {
      expect(cases.filter((item) => item.flow === flow).every((item) => item.expectedTool === null)).toBe(true)
    }
  })

  it('freezes the two infrastructure limits observed during the audit', () => {
    expect(cacheSource).toContain('.limit(200)')
    expect(repositorySource).toContain("openai.embedding('text-embedding-3-small')")
    expect(repositorySource).not.toContain('dimensions: 512')
    expect(manualMigrationSource).toContain('vector(512)')
  })

  it('keeps current verdicts explicit instead of treating missing evidence as a pass', () => {
    expect(cases.filter((item) => item.currentStatus === 'PASS').map((item) => item.id)).toEqual([
      'motorbike-warranty-context',
    ])
    expect(cases.filter((item) => item.currentStatus === 'PARTIAL').map((item) => item.id)).toEqual([
      'car-warranty-vf8',
    ])
    expect(cases.filter((item) => item.currentStatus === 'FAIL')).toHaveLength(6)
    expect(cases.find((item) => item.flow === 'official_pdf')?.currentStatus).toBe('LINK_ONLY')
  })
})
