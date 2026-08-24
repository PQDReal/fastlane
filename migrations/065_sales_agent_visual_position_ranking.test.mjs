import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL('./065_sales_agent_visual_position_ranking.sql', import.meta.url)

describe('Migration 065 — position-aware visual retrieval', () => {
  it('ranks both approved and development-draft RPCs by evidence before image position', async () => {
    const sql = await readFile(migrationPath, 'utf8')

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.sales_agent_search_knowledge_visuals(')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.sales_agent_search_knowledge_visuals_with_drafts(')
    expect(sql.match(/array_position\(/gu)?.length).toBeGreaterThanOrEqual(8)
    expect(sql).toContain("occurrence.source_locator ->> 'blockOrdinal'")
    expect(sql).toContain("occurrence.source_locator ->> 'imageOrdinalInBlock'")
    expect(sql.match(/ORDER BY candidates\.evidence_rank,/gu)).toHaveLength(2)
    expect(sql).toContain('FROM PUBLIC, anon, authenticated')
    expect(sql).toContain('TO service_role')
  })
})
