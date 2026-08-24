import { describe, it, expect } from 'vitest'
import { KnowledgeIndexingPipeline } from './indexing-pipeline'
import type { DocumentTreeInput } from './hierarchical-chunker'

describe('KnowledgeIndexingPipeline (A19-KR-205, 208, 209)', () => {
  const pipeline = new KnowledgeIndexingPipeline({
    indexGenerationId: 'openai-text-embedding-3-small-1536-v1',
    embeddingConfig: { allowMock: true },
  })

  it('runs complete indexing pipeline with 1536-dim embeddings and smoke test', async () => {
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
      expect(chunk.embedding.length).toBe(1536)
      expect(chunk.indexGenerationId).toBe('openai-text-embedding-3-small-1536-v1')
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

  it('fails closed when non-mock adapter is initialized without OPENAI_API_KEY', () => {
    const originalKey = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY
    try {
      expect(() => new KnowledgeIndexingPipeline({ embeddingConfig: { allowMock: false } })).toThrow(/OPENAI_API_KEY is required/)
    } finally {
      if (originalKey) process.env.OPENAI_API_KEY = originalKey
    }
  })
})
