import { describe, it, expect, vi } from 'vitest'
import { KnowledgeIndexingPipeline, persistIndexedChunks } from './indexing-pipeline'
import {
  OPENAI_EMBEDDING_DIMENSIONS,
  OPENAI_EMBEDDING_GENERATION_ID,
  type EmbeddingProvider,
} from './embedding-adapter'
import type { DocumentTreeInput } from './hierarchical-chunker'

describe('KnowledgeIndexingPipeline (A19-KR-205, 208, 209)', () => {
  const testEmbeddingProvider: EmbeddingProvider = {
    async generateEmbeddings(texts) {
      return {
        embeddings: texts.map((_, index) => {
          const embedding = new Array(OPENAI_EMBEDDING_DIMENSIONS).fill(0)
          embedding[index % embedding.length] = 1
          return { index, embedding }
        }),
        totalTokens: texts.length * 10,
        model: 'text-embedding-3-small',
        dimensions: OPENAI_EMBEDDING_DIMENSIONS,
      }
    },
  }
  const pipeline = new KnowledgeIndexingPipeline({
    indexGenerationId: OPENAI_EMBEDDING_GENERATION_ID,
    embeddingProvider: testEmbeddingProvider,
  })

  it('runs complete indexing pipeline with 512-dim embeddings and smoke test', async () => {
    const docTree: DocumentTreeInput = {
      documentKey: 'vinfast:VF7:2025:vi-VN',
      title: 'Sổ tay hướng dẫn sử dụng VinFast VF 7 2025',
      category: 'TECHNICAL_GUIDE',
      vehicleModel: 'VF 7',
      modelYear: 2025,
      sections: [
        {
          chapterTitle: 'Thông số kỹ thuật',
          sectionTitle: 'Kích thước lốp và mâm xe',
          contentMarkdown: 'VF 7 bản Plus sử dụng mâm hợp kim 20 inch, thông số lốp 245/45R20.',
        },
      ],
    }

    const report = await pipeline.processDocumentTree(docTree)
    expect(report.documentKey).toBe('vinfast:VF7:2025:vi-VN')
    expect(report.totalChunks).toBeGreaterThanOrEqual(3)
    expect(report.validationPassed).toBe(true)
    expect(report.newlyEmbeddedCount).toBe(report.totalChunks)
    expect(report.reusedEmbeddingsCount).toBe(0)

    // Check embedding dimensions and unit magnitude
    report.chunks.forEach((chunk) => {
      expect(chunk.embedding.length).toBe(OPENAI_EMBEDDING_DIMENSIONS)
      expect(chunk.indexGenerationId).toBe(OPENAI_EMBEDDING_GENERATION_ID)
      const mag = Math.sqrt(chunk.embedding.reduce((s, v) => s + v * v, 0))
      expect(mag).toBeGreaterThan(0.9)
    })
  })

  it('re-uses existing embeddings for unchanged content hashes (Delta reuse)', async () => {
    const docTree: DocumentTreeInput = {
      documentKey: 'vinfast:VF7:2025:vi-VN',
      title: 'Sổ tay hướng dẫn sử dụng VinFast VF 7 2025',
      category: 'TECHNICAL_GUIDE',
      vehicleModel: 'VF 7',
      modelYear: 2025,
      sections: [
        {
          chapterTitle: 'Thông số kỹ thuật',
          sectionTitle: 'Kích thước lốp và mâm xe',
          contentMarkdown: 'VF 7 bản Plus sử dụng mâm hợp kim 20 inch, thông số lốp 245/45R20.',
        },
      ],
    }

    const cache = new Map<string, number[]>()
    // First run: fills cache
    const report1 = await pipeline.processDocumentTree(docTree, cache)
    expect(report1.newlyEmbeddedCount).toBeGreaterThan(0)
    expect(cache.size).toBe(report1.totalChunks)

    // Second run: 100% delta reuse
    const report2 = await pipeline.processDocumentTree(docTree, cache)
    expect(report2.reusedEmbeddingsCount).toBe(report2.totalChunks)
    expect(report2.newlyEmbeddedCount).toBe(0)
  })

  it('fails closed when the production adapter is initialized without OPENAI_API_KEY', () => {
    const originalKey = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY
    try {
      expect(() => new KnowledgeIndexingPipeline()).toThrow(/OPENAI_API_KEY is required/)
    } finally {
      if (originalKey) process.env.OPENAI_API_KEY = originalKey
    }
  })

  it('persists validated hierarchical chunks and parent links through the worker-facing writer', async () => {
    const report = await pipeline.processDocumentTree({
      documentKey: 'vinfast:VF7:2025:vi-VN',
      title: 'Sổ tay VF 7',
      category: 'TECHNICAL_GUIDE',
      vehicleModel: 'VF 7',
      modelYear: 2025,
      sections: [{
        chapterTitle: 'Sạc',
        sectionTitle: 'Hướng dẫn',
        contentMarkdown: 'Bước 1 cắm sạc. Bước 2 kiểm tra đèn báo.',
      }],
    })

    const chunkRows = report.chunks.map((chunk, index) => ({
      id: `chunk-${index}`,
      chunk_index: chunk.chunkIndex,
      hierarchy_path: chunk.hierarchyPath,
    }))
    const versionUpdate = {
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(() => Promise.resolve({ error: null })),
        })),
      })),
    }
    const chunkTable = {
      upsert: vi.fn(() => ({ select: vi.fn(() => Promise.resolve({ data: chunkRows, error: null })) })),
      update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
    }
    const client = {
      from: vi.fn((table: string) => table === 'sales_agent_knowledge_versions' ? versionUpdate : chunkTable),
      rpc: vi.fn().mockResolvedValue({ data: report.chunks.filter((chunk) => chunk.parentHierarchyPath).length, error: null }),
    } as any

    const result = await persistIndexedChunks({
      client,
      documentId: 'doc-1',
      versionId: 'ver-1',
      versionNo: 1,
      indexGenerationId: OPENAI_EMBEDDING_GENERATION_ID,
      chunks: report.chunks,
    })

    expect(result.persistedChunkCount).toBe(report.chunks.length)
    expect(result.parentLinks).toBeGreaterThan(0)
    expect(chunkTable.upsert).toHaveBeenCalledOnce()
    expect(client.rpc).toHaveBeenCalledWith('sales_agent_finalize_knowledge_hierarchy', { p_version_id: 'ver-1' })
    expect(versionUpdate.update).toHaveBeenCalledWith({ index_status: 'READY' })
  })
})
