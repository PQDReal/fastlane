import { describe, expect, it, vi } from 'vitest'
import { PostgresFtsAdapter } from './fts-adapter'
import { VectorCandidateAdapter } from './vector-adapter'
import type { RawChunkCandidate } from './contracts'

const generationId = 'openai-text-embedding-3-small-512-v1'

const candidate: RawChunkCandidate = {
  chunkId: '11111111-1111-4111-8111-111111111111',
  documentId: '22222222-2222-4222-8222-222222222222',
  documentKey: 'vinfast:manual:VF8:2023:vi-VN',
  versionId: '33333333-3333-4333-8333-333333333333',
  versionNo: 1,
  indexGenerationId: generationId,
  chunkLevel: 3,
  hierarchyPath: 'root/c09_bao-duong/s06_lich-bao-duong/leaf_01',
  sectionAnchor: 'maintenance-p1',
  sectionTitle: 'Lịch bảo dưỡng',
  content: 'Nội dung bảo dưỡng xe.',
  contentHash: 'content-hash',
  tokenCount: 8,
  chunkOrdinal: 475,
  tags: ['bảo dưỡng'],
  scopeMetadata: [{ vehicleModel: 'VF 8', modelYearFrom: 2023, modelYearTo: 2023, market: 'VN' }],
  sourceNodeId: 'node-maintenance',
  imageRefs: [],
  title: 'Sổ tay VF 8 2023',
  slug: 'so-tay-vf-8-2023',
  category: 'TECHNICAL_GUIDE',
  effectiveFrom: '2023-01-01T00:00:00.000Z',
  effectiveTo: null,
  publicationStatus: 'PUBLISHED',
  indexStatus: 'READY',
}

const rpcRow = {
  id: candidate.chunkId,
  document_id: candidate.documentId,
  document_key: candidate.documentKey,
  version_id: candidate.versionId,
  version_no: candidate.versionNo,
  index_generation_id: candidate.indexGenerationId,
  chunk_level: candidate.chunkLevel,
  hierarchy_path: candidate.hierarchyPath,
  section_anchor: candidate.sectionAnchor,
  section_title: candidate.sectionTitle,
  content: candidate.content,
  content_hash: candidate.contentHash,
  token_count: candidate.tokenCount,
  chunk_ordinal: candidate.chunkOrdinal,
  tags: candidate.tags,
  scope_metadata: candidate.scopeMetadata,
  source_node_id: candidate.sourceNodeId,
  image_refs: candidate.imageRefs,
  title: candidate.title,
  slug: candidate.slug,
  category: candidate.category,
  effective_from: candidate.effectiveFrom,
  effective_to: candidate.effectiveTo,
  publication_status: candidate.publicationStatus,
  index_status: candidate.indexStatus,
  vector_score: 0.95,
}

describe('retrieval RPC hot paths', () => {
  it('uses the HNSW vector RPC with bounded candidate overfetch for broad retrieval', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [rpcRow], error: null })
    const embeddingProvider = {
      generateEmbeddings: vi.fn().mockResolvedValue({
        embeddings: [{ index: 0, embedding: new Array(512).fill(0.02) }],
        totalTokens: 1,
        model: 'test-embedding',
        dimensions: 512,
      }),
    }
    const adapter = new VectorCandidateAdapter(undefined, { rpc } as any, generationId, embeddingProvider as any)

    const results = await adapter.searchCandidates(
      'bảo hành',
      {},
      { vectorCandidateLimit: 5 }
    )

    expect(results).toHaveLength(1)
    expect(rpc).toHaveBeenCalledWith(
      'sales_agent_search_knowledge_vector_hnsw',
      expect.objectContaining({ p_limit: 5, p_candidate_limit: 100 })
    )
  })

  it('keeps exact vector search for selective scopes', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [rpcRow], error: null })
    const embeddingProvider = {
      generateEmbeddings: vi.fn().mockResolvedValue({
        embeddings: [{ index: 0, embedding: new Array(512).fill(0.02) }],
        totalTokens: 1,
        model: 'test-embedding',
        dimensions: 512,
      }),
    }
    const adapter = new VectorCandidateAdapter(undefined, { rpc } as any, generationId, embeddingProvider as any)

    const results = await adapter.searchCandidates(
      'bảo hành',
      { vehicleModel: 'VF 8', modelYear: 2023 },
      { vectorCandidateLimit: 5 }
    )

    expect(results).toHaveLength(1)
    expect(rpc).toHaveBeenCalledWith(
      'sales_agent_search_knowledge_vector',
      expect.not.objectContaining({ p_candidate_limit: expect.anything() })
    )
  })

  it('loads hierarchy context by selected chunk ids', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [rpcRow], error: null })
    const adapter = new PostgresFtsAdapter({ rpc } as any)

    const results = await adapter.loadHierarchyContext(
      [candidate],
      { vehicleModel: 'VF 8', modelYear: 2023 },
      { generationId }
    )

    expect(results).toHaveLength(1)
    expect(rpc).toHaveBeenCalledWith(
      'sales_agent_load_knowledge_hierarchy_targets',
      expect.objectContaining({ p_chunk_ids: [candidate.chunkId], p_max_neighbors: 1 })
    )
  })

  it('falls back to the previous vector RPC only when the new RPC is missing', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
      .mockResolvedValueOnce({ data: [rpcRow], error: null })
    const embeddingProvider = {
      generateEmbeddings: vi.fn().mockResolvedValue({
        embeddings: [{ index: 0, embedding: new Array(512).fill(0.02) }],
        totalTokens: 1,
        model: 'test-embedding',
        dimensions: 512,
      }),
    }
    const adapter = new VectorCandidateAdapter(undefined, { rpc } as any, generationId, embeddingProvider as any)

    const results = await adapter.searchCandidates('bảo hành', {}, { vectorCandidateLimit: 5 })

    expect(results).toHaveLength(1)
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'sales_agent_search_knowledge_vector_hnsw',
      'sales_agent_search_knowledge_vector',
    ])
  })
})
