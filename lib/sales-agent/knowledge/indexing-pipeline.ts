import { buildHierarchicalChunks, type DocumentTreeInput, type HierarchicalChunk } from './hierarchical-chunker'
import { OpenAIEmbeddingAdapter, type EmbeddingAdapterConfig } from './embedding-adapter'
import type { SupabaseClient } from '@supabase/supabase-js'

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

export interface PersistIndexedChunksInput {
  client: SupabaseClient
  documentId: string
  versionId: string
  versionNo: number
  indexGenerationId: string
  chunks: IndexedChunkPayload[]
}

/**
 * Persist a validated pipeline result for an already-enqueued version job.
 * This is intentionally explicit and worker-facing; no admin request calls it
 * directly.  Upsert is keyed by the legacy 058 identity while all 060 fields
 * (version, generation, hierarchy, source/image metadata and embedding) are
 * written together. The database trigger supplies tsv_content.
 */
export async function persistIndexedChunks(input: PersistIndexedChunksInput): Promise<{
  persistedChunkCount: number
  parentLinks: number
}> {
  const { client, documentId, versionId, versionNo, indexGenerationId, chunks } = input
  if (!client) throw new Error('SupabaseClient is required to persist indexed chunks')
  if (!documentId || !versionId || !Number.isInteger(versionNo) || versionNo < 1) {
    throw new Error('Invalid document/version identity for indexed chunk persistence')
  }
  if (!chunks.length) throw new Error('Cannot persist an empty indexed chunk set')
  if (chunks.some((chunk) => chunk.indexGenerationId !== indexGenerationId)) {
    throw new Error('Indexed chunk generation mismatch (fail-closed)')
  }
  if (chunks.some((chunk) => {
    if (!chunk.embedding || chunk.embedding.length !== 1536 || chunk.embedding.some((value) => !Number.isFinite(value))) return true
    const magnitude = Math.sqrt(chunk.embedding.reduce((sum, value) => sum + value * value, 0))
    return !Number.isFinite(magnitude) || magnitude <= 0.1
  })) {
    throw new Error('Indexed chunk contains an invalid embedding vector')
  }

  try {
    const orderedChunks = [...chunks].sort((a, b) => {
      if (a.chunkLevel !== b.chunkLevel) return a.chunkLevel - b.chunkLevel
      return a.chunkIndex - b.chunkIndex
    })
    const rows = orderedChunks.map((chunk) => ({
      document_id: documentId,
      version: versionNo,
      chunk_index: chunk.chunkIndex,
      section_title: chunk.sectionTitle,
      content: chunk.content,
      tags: chunk.tags,
      is_active: true,
      version_id: versionId,
      index_generation_id: indexGenerationId,
      parent_chunk_id: null,
      chunk_level: chunk.chunkLevel,
      hierarchy_path: chunk.hierarchyPath,
      section_anchor: chunk.sectionAnchor,
      source_node_id: chunk.sourceNodeId ?? null,
      image_refs: chunk.extractedImages ?? [],
      content_hash: chunk.contentHash,
      token_count: chunk.tokenCount,
      embedding: chunk.embedding,
    }))

    const { data, error } = await client
      .from('sales_agent_knowledge_chunks')
      .upsert(rows, { onConflict: 'document_id,version,chunk_index' })
      .select('id,chunk_index,hierarchy_path')
    if (error || !Array.isArray(data) || data.length !== rows.length) {
      throw new Error(`Failed to persist indexed chunks: ${error?.message || 'row count mismatch'}`)
    }

    const idByPath = new Map<string, string>()
    for (const row of data) {
      if (!row?.id || !row?.hierarchy_path) {
        throw new Error('Indexed chunk persistence returned an invalid identity')
      }
      idByPath.set(String(row.hierarchy_path), String(row.id))
    }

    let parentLinks = 0
    for (const chunk of orderedChunks) {
      if (!chunk.parentHierarchyPath) continue
      const childId = idByPath.get(chunk.hierarchyPath)
      const parentId = idByPath.get(chunk.parentHierarchyPath)
      if (!childId || !parentId) {
        throw new Error(`Hierarchy parent missing for chunk ${chunk.chunkIndex}`)
      }
      const { error: parentError } = await client
        .from('sales_agent_knowledge_chunks')
        .update({ parent_chunk_id: parentId })
        .eq('id', childId)
      if (parentError) throw new Error(`Failed to persist hierarchy parent link: ${parentError.message}`)
      parentLinks++
    }

    const { error: readyError } = await client
      .from('sales_agent_knowledge_versions')
      .update({ index_status: 'READY' })
      .eq('id', versionId)
      .in('index_status', ['BUILDING', 'VALIDATING'])
    if (readyError) throw new Error(`Failed to mark indexed version READY: ${readyError.message}`)

    return { persistedChunkCount: rows.length, parentLinks }
  } catch (error) {
    try {
      await client
        .from('sales_agent_knowledge_versions')
        .update({ index_status: 'FAILED' })
        .eq('id', versionId)
        .in('index_status', ['BUILDING', 'VALIDATING'])
    } catch {
      // Preserve the original persistence failure.
    }
    throw error
  }
}

export class KnowledgeIndexingPipeline {
  private embeddingAdapter: OpenAIEmbeddingAdapter
  private indexGenerationId: string

  constructor(options: IndexingPipelineOptions = {}) {
    this.indexGenerationId = options.indexGenerationId || 'openai-text-embedding-3-small-1536-v1'
    this.embeddingAdapter = new OpenAIEmbeddingAdapter(options.embeddingConfig)
  }

  private isValidEmbedding(embedding: number[] | undefined): embedding is number[] {
    if (!embedding || embedding.length !== 1536) return false
    if (embedding.some((value) => !Number.isFinite(value))) return false
    const magnitude = Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0))
    return Number.isFinite(magnitude) && magnitude > 0.1
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
      if (this.isValidEmbedding(existingEmbedding)) {
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
        if (!this.isValidEmbedding(emb)) {
          throw new Error(`Embedding generation returned invalid result for chunk ${item.chunk.chunkIndex} (Fail-Closed D-019-011)`)
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
      if (!this.isValidEmbedding(chunk.embedding)) {
        throw new Error(`Validation failed: Invalid embedding dimension in chunk ${chunk.chunkIndex}, expected 1536`)
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
