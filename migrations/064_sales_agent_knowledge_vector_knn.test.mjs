import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL('./064_sales_agent_knowledge_vector_knn.sql', import.meta.url)

describe('Migration 064 — vector KNN scope plan', () => {
  it('keeps the existing RPC signature and uses filtered cosine KNN ordering', async () => {
    const sql = await readFile(migrationPath, 'utf8')

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.sales_agent_search_knowledge_vector(')
    expect(sql).toContain('p_query_embedding vector(512)')
    expect(sql).toContain('p_effective_at TIMESTAMPTZ')
    expect(sql).toContain('c.index_generation_id = p_index_generation_id')
    expect(sql).toContain('c.is_active')
    expect(sql).toContain("v.publication_status = 'PUBLISHED'")
    expect(sql).toContain("v.index_status = 'READY'")
    expect(sql).toContain('ORDER BY c.embedding <=> p_query_embedding, c.id')
    expect(sql).toContain('idx_knowledge_chunks_generation_active_embedding')
    expect(sql).toContain('idx_knowledge_documents_active_scope_lookup')
    expect(sql).toContain('FROM PUBLIC, anon, authenticated')
    expect(sql).toContain('TO service_role')
  })
})
