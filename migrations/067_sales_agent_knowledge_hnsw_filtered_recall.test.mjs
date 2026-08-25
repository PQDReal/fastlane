import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL('./067_sales_agent_knowledge_hnsw_filtered_recall.sql', import.meta.url)
const downPath = new URL('./067_sales_agent_knowledge_hnsw_filtered_recall.down.sql', import.meta.url)

describe('Migration 067 — filtered HNSW recall', () => {
  it('enables bounded iterative scanning on the HNSW RPC', async () => {
    const sql = await readFile(migrationPath, 'utf8')

    expect(sql).toContain('sales_agent_search_knowledge_vector_hnsw_filtered')
    expect(sql).toContain("set_config('hnsw.iterative_scan', 'strict_order', true)")
    expect(sql).toContain("set_config('hnsw.ef_search', '100', true)")
    expect(sql).toContain("set_config('hnsw.max_scan_tuples', '20000', true)")
    expect(sql).toContain('sales_agent_search_knowledge_vector_hnsw(')
    expect(sql).toContain('TO service_role')
  })

  it('can drop the iterative-scan wrapper', async () => {
    const down = await readFile(downPath, 'utf8')

    expect(down).toContain('DROP FUNCTION IF EXISTS public.sales_agent_search_knowledge_vector_hnsw_filtered')
  })
})
