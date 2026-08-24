import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { PostgresFtsAdapter } from './retrieval/fts-adapter'
import { VectorCandidateAdapter } from './retrieval/vector-adapter'
import { HybridHierarchicalRetrievalService } from './retrieval/retrieval-service'
import { KnowledgeStorageUnavailableError } from './retrieval/contracts'
import {
  OPENAI_EMBEDDING_DIMENSIONS,
  OPENAI_EMBEDDING_GENERATION_ID,
  type EmbeddingProvider,
} from './embedding-adapter'

describe('Phase P5 — Lifecycle & Concurrency Fault Suite (A19-KR-501)', () => {
  const deterministicEmbeddingProvider: EmbeddingProvider = {
    async generateEmbeddings(texts) {
      return {
        embeddings: texts.map((_, index) => ({ index, embedding: new Array(OPENAI_EMBEDDING_DIMENSIONS).fill(0.015) })),
        totalTokens: texts.length,
        model: 'text-embedding-3-small',
        dimensions: OPENAI_EMBEDDING_DIMENSIONS,
      }
    },
  }
  const failingEmbeddingProvider: EmbeddingProvider = {
    async generateEmbeddings() {
      throw new Error('test embedding outage')
    },
  }
  const sampleCorpus = [
    {
      chunkId: 'chunk-1',
      documentId: 'doc-vf8',
      documentKey: 'vinfast:VF8:2025:vi-VN',
      versionId: 'ver-1',
      versionNo: 1,
      indexGenerationId: 'gen-1',
      chunkLevel: 2,
      hierarchyPath: '01_Tong_quan/01_Pin',
      sectionAnchor: 'pin_cao_ap',
      sectionTitle: 'Bảo dưỡng và sạc pin cao áp',
      content: 'Pin cao áp VinFast VF 8 có dung lượng 87.7 kWh, bảo hành 10 năm không giới hạn số km.',
      contentHash: 'hash-1',
      tokenCount: 25,
      tags: ['VF 8', 'Pin', 'Bảo dưỡng'],
      title: 'Sổ tay hướng dẫn sử dụng VinFast VF 8 (2025)',
      slug: 'manual-vf8-2025',
      category: 'TECHNICAL_GUIDE' as const,
      effectiveFrom: '2025-01-01T00:00:00Z',
      effectiveTo: null,
      publicationStatus: 'PUBLISHED' as const,
      indexStatus: 'READY' as const,
      embedding: new Array(OPENAI_EMBEDDING_DIMENSIONS).fill(0.015),
    },
    {
      chunkId: 'chunk-2',
      documentId: 'doc-vf3',
      documentKey: 'vinfast:VF3:2025:vi-VN',
      versionId: 'ver-2',
      versionNo: 1,
      indexGenerationId: 'gen-1',
      chunkLevel: 2,
      hierarchyPath: '01_Tong_quan/01_Pin',
      sectionAnchor: 'pin_cao_ap',
      sectionTitle: 'Bảo hành pin mini-SUV',
      content: 'Pin cao áp VinFast VF 3 bảo hành 8 năm hoặc 160.000 km.',
      contentHash: 'hash-2',
      tokenCount: 20,
      tags: ['VF 3', 'Pin'],
      title: 'Sổ tay hướng dẫn sử dụng VinFast VF 3 (2025)',
      slug: 'manual-vf3-2025',
      category: 'TECHNICAL_GUIDE' as const,
      effectiveFrom: '2025-01-01T00:00:00Z',
      effectiveTo: null,
      publicationStatus: 'PUBLISHED' as const,
      indexStatus: 'READY' as const,
      embedding: new Array(OPENAI_EMBEDDING_DIMENSIONS).fill(0.012),
    },
  ]

  it('handles 20 concurrent retrieval requests with deterministic ordering and zero race conditions', async () => {
    const service = new HybridHierarchicalRetrievalService({
      embeddingProvider: deterministicEmbeddingProvider,
    })
    const concurrentRequests = Array.from({ length: 20 }, () =>
      service.retrieve(
        'bảo hành pin VF 8',
        { vehicleModel: 'VF 8' },
        { retrievalMode: 'HYBRID_HIERARCHICAL', topK: 2 },
        sampleCorpus
      )
    )

    const results = await Promise.all(concurrentRequests)
    expect(results.length).toBe(20)

    // Verify all 20 concurrent executions produce the identical top hit and deterministic citations
    const firstCitation = results[0].items[0]?.citationId
    for (let i = 1; i < results.length; i++) {
      expect(results[i].status).toBe('SUCCESS')
      expect(results[i].items.length).toBe(results[0].items.length)
      expect(results[i].items[0]?.citationId).toBe(firstCitation)
    }
  })

  it('fails closed in pure VECTOR mode when embedding fails', async () => {
    const brokenVectorAdapter = new VectorCandidateAdapter(
      undefined,
      undefined,
      OPENAI_EMBEDDING_GENERATION_ID,
      failingEmbeddingProvider,
    )

    // Search should throw fail-closed error
    await expect(
      brokenVectorAdapter.searchCandidates('pin', {}, {}, sampleCorpus)
    ).rejects.toThrow('Query embedding failed')
  })

  it('gracefully degrades to DEGRADED_FTS in HYBRID mode when embedding fails', async () => {
    const service = new HybridHierarchicalRetrievalService({
      embeddingProvider: failingEmbeddingProvider,
    })

    const res = await service.retrieve(
      'bảo dưỡng pin VF 8',
      {},
      { retrievalMode: 'HYBRID_HIERARCHICAL' },
      sampleCorpus
    )

    expect(res.status).toBe('DEGRADED_FTS')
    expect(res.items.length).toBeGreaterThan(0)
    expect(res.items[0].documentKey).toBe('vinfast:VF8:2025:vi-VN')
  })

  it('returns NO_MATCH when no candidates match in FTS mode and never hallucinates fake data', async () => {
    const service = new HybridHierarchicalRetrievalService()

    const res = await service.retrieve(
      'xyznonexistentkeyword999999',
      {},
      { retrievalMode: 'FTS' },
      sampleCorpus
    )

    expect(res.status).toBe('NO_MATCH')
    expect(res.items).toEqual([])
    expect(res.totalFound).toBe(0)
  })

  it('throws KnowledgeStorageUnavailableError when storage is completely unavailable and no lexical match', async () => {
    const brokenService = new HybridHierarchicalRetrievalService({
      embeddingProvider: failingEmbeddingProvider,
    })

    // When query has no lexical match and vector embedding throws
    await expect(
      brokenService.retrieve(
        'xyznonexistentkeyword999999',
        {},
        { retrievalMode: 'HYBRID_HIERARCHICAL' },
        sampleCorpus
      )
    ).rejects.toThrow(KnowledgeStorageUnavailableError)
  })
})
