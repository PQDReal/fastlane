import { buildHierarchicalChunks, type DocumentTreeInput, type HierarchicalChunk } from './hierarchical-chunker'
import { OpenAIEmbeddingAdapter, type EmbeddingAdapterConfig } from './embedding-adapter'

export interface IndexedChunkPayload extends HierarchicalChunk {
  embedding: number[]
  indexGenerationId: string
  versionId?: string
}

export interface IndexingPipelineOptions {
  indexGenerationId?: string
  embeddingConfig?: EmbeddingAdapterConfig
  existingChunkHashes?: Set<string>
  cachedEmbeddingsByHash?: Map<string, number[]>
}

export interface IndexingPipelineReport {
  documentKey: string
  title: string
  totalChunks: number
  reusedEmbeddingsCount: number
  newlyEmbeddedCount: number
  totalTokensUsed: number
  chunks: IndexedChunkPayload[]
  validationPassed: boolean
  smokeTestResult: { query: string; matchedChunkIndex: number; score: number }
}

export class KnowledgeIndexingPipeline {
  private embeddingAdapter: OpenAIEmbeddingAdapter
  private indexGenerationId: string

  constructor(options: IndexingPipelineOptions = {}) {
    this.indexGenerationId = options.indexGenerationId || 'openai-text-embedding-3-small-1536-v1'
    this.embeddingAdapter = new OpenAIEmbeddingAdapter(options.embeddingConfig)
  }

  /**
   * Chạy pipeline lập chỉ mục hoàn chỉnh cho một tài liệu cây phân cấp (A19-KR-205, 208, 209)
   */
  async processDocumentTree(
    docTree: DocumentTreeInput,
    cachedEmbeddings: Map<string, number[]> = new Map()
  ): Promise<IndexingPipelineReport> {
    // 1. Stage: CHUNK (Phân tầng cây)
    const rawChunks = buildHierarchicalChunks(docTree)
    if (rawChunks.length === 0) {
      throw new Error(`Chunking failed: Document '${docTree.documentKey}' produced 0 chunks`)
    }

    // 2. Stage: DELTA REUSE & EMBEDDING BATCHING
    const chunksToEmbed: { chunk: HierarchicalChunk; text: string }[] = []
    const indexedChunks: IndexedChunkPayload[] = []
    let reusedCount = 0

    for (const chunk of rawChunks) {
      const cacheKey = `${this.indexGenerationId}:${chunk.sectionTitle}:${chunk.contentHash}`
      const existingEmbedding = cachedEmbeddings.get(cacheKey)
      if (existingEmbedding && existingEmbedding.length === 1536) {
        // Tái sử dụng embedding đã có (Delta reuse - A19-KR-208)
        reusedCount++
        indexedChunks.push({
          ...chunk,
          embedding: existingEmbedding,
          indexGenerationId: this.indexGenerationId,
        })
      } else {
        // Chuẩn bị text embedding có gắn ngữ cảnh tiêu đề để nâng cao chất lượng vector
        const embeddingInput = `Tiêu đề: ${chunk.sectionTitle}\nNội dung: ${chunk.content}`
        chunksToEmbed.push({ chunk, text: embeddingInput })
      }
    }

    let newlyEmbeddedCount = 0
    let totalTokensUsed = 0

    if (chunksToEmbed.length > 0) {
      const texts = chunksToEmbed.map((c) => c.text)
      const embeddingResponse = await this.embeddingAdapter.generateEmbeddings(texts)
      newlyEmbeddedCount = chunksToEmbed.length
      totalTokensUsed = embeddingResponse.totalTokens

      chunksToEmbed.forEach((item, idx) => {
        const emb = embeddingResponse.embeddings[idx]?.embedding
        if (!emb || emb.length !== 1536) {
          throw new Error(`Embedding generation returned invalid result for chunk ${item.chunk.chunkIndex} (Fail-Closed D-019-011)`)
        }

        const magnitude = Math.sqrt(emb.reduce((sum, v) => sum + v * v, 0))
        if (magnitude < 0.1) {
          throw new Error(`Embedding vector magnitude is zero/near-zero for chunk ${item.chunk.chunkIndex} (Fail-Closed D-019-011)`)
        }

        indexedChunks.push({
          ...item.chunk,
          embedding: emb,
          indexGenerationId: this.indexGenerationId,
        })
        const cacheKey = `${this.indexGenerationId}:${item.chunk.sectionTitle}:${item.chunk.contentHash}`
        cachedEmbeddings.set(cacheKey, emb)
      })
    }

    // Sắp xếp lại chunks theo chunkIndex
    indexedChunks.sort((a, b) => a.chunkIndex - b.chunkIndex)

    // 3. Stage: VALIDATION (A19-KR-209)
    const validationPassed = this.validateIndexedChunks(indexedChunks)

    // 4. Stage: SMOKE TEST
    const smokeTestResult = this.runSmokeTest(docTree, indexedChunks)

    return {
      documentKey: docTree.documentKey,
      title: docTree.title,
      totalChunks: indexedChunks.length,
      reusedEmbeddingsCount: reusedCount,
      newlyEmbeddedCount,
      totalTokensUsed,
      chunks: indexedChunks,
      validationPassed,
      smokeTestResult,
    }
  }

  private validateIndexedChunks(chunks: IndexedChunkPayload[]): boolean {
    for (const chunk of chunks) {
      if (!chunk.content || chunk.content.length === 0) {
        throw new Error(`Validation failed: Empty content in chunk ${chunk.chunkIndex}`)
      }
      if (!chunk.embedding || chunk.embedding.length !== 1536) {
        throw new Error(`Validation failed: Invalid embedding dimension in chunk ${chunk.chunkIndex}, expected 1536`)
      }
      const magnitude = Math.sqrt(chunk.embedding.reduce((sum, v) => sum + v * v, 0))
      if (magnitude < 0.1) {
        throw new Error(`Validation failed: Zero or near-zero embedding vector in chunk ${chunk.chunkIndex} (Fail-Closed)`)
      }
      if (!chunk.hierarchyPath) {
        throw new Error(`Validation failed: Missing hierarchyPath in chunk ${chunk.chunkIndex}`)
      }
    }
    return true
  }

  private runSmokeTest(
    docTree: DocumentTreeInput,
    chunks: IndexedChunkPayload[]
  ): { query: string; matchedChunkIndex: number; score: number } {
    const query = docTree.title
    // Lexical probe test
    let bestScore = -1
    let bestIdx = 0

    chunks.forEach((c) => {
      let score = 0
      if (c.sectionTitle.toLowerCase().includes(docTree.vehicleModel?.toLowerCase() || '___')) score += 10
      if (c.content.toLowerCase().includes('hướng dẫn')) score += 5
      if (score > bestScore) {
        bestScore = score
        bestIdx = c.chunkIndex
      }
    })

    return {
      query,
      matchedChunkIndex: bestIdx,
      score: bestScore,
    }
  }
}
