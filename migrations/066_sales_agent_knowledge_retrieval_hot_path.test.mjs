import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL('./066_sales_agent_knowledge_retrieval_hot_path.sql', import.meta.url)
const downPath = new URL('./066_sales_agent_knowledge_retrieval_hot_path.down.sql', import.meta.url)

describe('Migration 066 — retrieval hot paths', () => {
  it('adds an HNSW-first vector RPC with bounded overfetch and the existing scope gates', async () => {
    const sql = await readFile(migrationPath, 'utf8')

    expect(sql).toContain('sales_agent_search_knowledge_vector_hnsw')
    expect(sql).toContain('knn AS MATERIALIZED')
    expect(sql).toContain('ORDER BY c.embedding <=> p_query_embedding, c.id')
    expect(sql).toContain('p_candidate_limit')
    expect(sql).toContain('2000')
    expect(sql).toContain("d.lifecycle_status = 'ACTIVE'")
    expect(sql).toContain("v.publication_status = 'PUBLISHED'")
    expect(sql).toContain("v.index_status = 'READY'")
  })

  it('loads only selected chunks, closest parents and adjacent procedure neighbors', async () => {
    const sql = await readFile(migrationPath, 'utf8')

    expect(sql).toContain('sales_agent_load_knowledge_hierarchy_targets')
    expect(sql).toContain('selected_ids AS MATERIALIZED')
    expect(sql).toContain('parent_candidates AS MATERIALIZED')
    expect(sql).toContain('neighbor_candidates AS MATERIALIZED')
    expect(sql).toContain("abs(neighbor.chunk_index - procedure_hit.chunk_index) = 1")
    expect(sql).toContain('parent_rank = 1')
    expect(sql).toContain('TO service_role')
  })

  it('provides a rollback for both additive RPCs', async () => {
    const down = await readFile(downPath, 'utf8')

    expect(down).toContain('DROP FUNCTION IF EXISTS public.sales_agent_load_knowledge_hierarchy_targets')
    expect(down).toContain('DROP FUNCTION IF EXISTS public.sales_agent_search_knowledge_vector_hnsw')
  })
})
