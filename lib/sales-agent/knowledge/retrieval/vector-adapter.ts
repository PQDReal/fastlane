import type { SupabaseClient } from '@supabase/supabase-js'
import { performance } from 'node:perf_hooks'
import {
  OPENAI_EMBEDDING_DIMENSIONS,
  OPENAI_EMBEDDING_GENERATION_ID,
  OpenAIEmbeddingAdapter,
  type EmbeddingAdapterConfig,
  type EmbeddingProvider,
} from '../embedding-adapter'
import type {
  KnowledgeScopeFilter,
  RawChunkCandidate,
  RetrievalOptions,
  VectorCandidate,
} from './contracts'
import { KnowledgeStorageUnavailableError } from './contracts'
import { matchesScope } from './fts-adapter'

export interface VectorIndexedCandidate extends RawChunkCandidate {
  embedding: number[]
}

export interface VectorSearchTelemetrySink {
  onEmbeddingLatency?: (durationMs: number) => void
  onVectorSearchLatency?: (durationMs: number) => void
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) {
    return 0
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }

  if (normA <= 0 || normB <= 0) return 0

  const sim = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
  return Number.isFinite(sim) ? Math.max(-1, Math.min(1, sim)) : 0
}

export class VectorCandidateAdapter {
  private embeddingConfig?: EmbeddingAdapterConfig
  private embeddingAdapter?: EmbeddingProvider
  private client?: SupabaseClient
  private defaultGenerationId: string

  constructor(
    embeddingConfig?: EmbeddingAdapterConfig,
    client?: SupabaseClient,
    defaultGenerationId = OPENAI_EMBEDDING_GENERATION_ID,
    embeddingProvider?: EmbeddingProvider,
  ) {
    this.embeddingConfig = embeddingConfig
    this.client = client
    this.defaultGenerationId = defaultGenerationId
    this.embeddingAdapter = embeddingProvider
  }

  private getEmbeddingAdapter(): EmbeddingProvider {
    if (!this.embeddingAdapter) {
      this.embeddingAdapter = new OpenAIEmbeddingAdapter(this.embeddingConfig)
    }
    return this.embeddingAdapter
  }

  /**
   * Embed query và tìm kiếm ứng viên vector tương đồng nhất
   */
  async searchCandidates(
    query: string,
    filters: KnowledgeScopeFilter = {},
    options: RetrievalOptions = {},
    inMemoryPool?: VectorIndexedCandidate[],
    telemetry?: VectorSearchTelemetrySink,
  ): Promise<VectorCandidate[]> {
    const limit = Math.max(1, Math.min(options.vectorCandidateLimit ?? 20, 100))
    const generationId = options.generationId ?? this.defaultGenerationId

    if (!query || query.trim().length === 0) {
      return []
    }

    // 1. Nhúng vector cho câu truy vấn
    let queryEmbedding: number[]
    const embeddingStartedAt = performance.now()
    try {
      const adapter = this.getEmbeddingAdapter()
      const resp = await adapter.generateEmbeddings([query.trim()])
      const emb = resp.embeddings[0]?.embedding
      if (!emb || emb.length !== OPENAI_EMBEDDING_DIMENSIONS) {
        throw new Error('Embedding service returned invalid vector dimensions')
      }
      let squaredNorm = 0
      for (const value of emb) {
        if (!Number.isFinite(value)) {
          throw new Error('Embedding service returned a non-finite vector value')
        }
        squaredNorm += value * value
      }
      if (!Number.isFinite(squaredNorm) || Math.sqrt(squaredNorm) <= 0.1) {
        throw new Error('Embedding service returned a near-zero vector')
      }
      queryEmbedding = emb
    } catch (err: any) {
      // Re-throw with clear message for fail-closed or degraded handling
      throw new Error(`Query embedding failed: ${err.message || 'Unknown embedding error'}`)
    } finally {
      telemetry?.onEmbeddingLatency?.(performance.now() - embeddingStartedAt)
    }

    const vectorSearchStartedAt = performance.now()
    try {
      // 2. Nếu có in-memory vector pool (evaluation / unit tests)
      if (inMemoryPool && inMemoryPool.length > 0) {
        return this.searchInMemoryVectorPool(
          inMemoryPool,
          queryEmbedding,
          filters,
          limit,
          generationId
        )
      }

      // 3. Nếu có Supabase Client kết nối DB pgvector
      if (this.client) {
        try {
          const { data, error } = await this.client.rpc('sales_agent_search_knowledge_vector', {
            p_query_embedding: queryEmbedding,
            p_index_generation_id: generationId,
            p_limit: limit,
            p_vehicle_model: filters.vehicleModel || null,
            p_vehicle_type: filters.vehicleType || null,
            p_model_year: filters.modelYear ?? null,
            p_customer_segment: filters.customerSegment || 'ALL',
            p_category: filters.category || null,
            p_market: filters.market || 'VN',
            p_locale: filters.locale || 'vi-VN',
            p_effective_at: filters.effectiveAt || new Date().toISOString(),
          })

          if (error) {
            throw new KnowledgeStorageUnavailableError(error.message, error)
          }
          if (!Array.isArray(data)) {
            throw new KnowledgeStorageUnavailableError('Vector RPC returned a null or invalid result set')
          }

          return data
            .filter((row: any) => String(row.index_generation_id) === generationId)
            .map((row: any, idx: number) => ({
              chunkId: String(row.id),
              documentId: String(row.document_id),
              documentKey: String(row.document_key),
              versionId: String(row.version_id),
              versionNo: Number(row.version_no),
              indexGenerationId: String(row.index_generation_id),
              chunkLevel: Number(row.chunk_level),
              hierarchyPath: String(row.hierarchy_path),
              sectionAnchor: String(row.section_anchor),
              sectionTitle: String(row.section_title),
              content: String(row.content),
              contentHash: String(row.content_hash || ''),
              tokenCount: Number(row.token_count || 0),
              chunkOrdinal: row.chunk_ordinal == null ? null : Number(row.chunk_ordinal),
              scopeMetadata: Array.isArray(row.scope_metadata) ? row.scope_metadata : undefined,
              tags: Array.isArray(row.tags) ? row.tags : [],
              sourceNodeId: row.source_node_id ?? null,
              imageRefs: Array.isArray(row.image_refs) ? row.image_refs : [],
              title: String(row.title),
              slug: String(row.slug || ''),
              category: row.category,
              effectiveFrom: String(row.effective_from),
              effectiveTo: row.effective_to ?? null,
              publicationStatus: row.publication_status,
              indexStatus: row.index_status,
              vectorRank: idx + 1,
              vectorScore: Number(row.vector_score ?? row.similarity ?? 0),
            }))
        } catch (err: any) {
          if (err instanceof KnowledgeStorageUnavailableError) throw err
          throw new KnowledgeStorageUnavailableError(err?.message || 'Vector RPC query failed', err)
        }
      }

      return []
    } finally {
      telemetry?.onVectorSearchLatency?.(performance.now() - vectorSearchStartedAt)
    }
  }

  private searchInMemoryVectorPool(
    pool: VectorIndexedCandidate[],
    queryEmbedding: number[],
    filters: KnowledgeScopeFilter,
    limit: number,
    generationId: string
  ): VectorCandidate[] {
    const scored: { candidate: VectorIndexedCandidate; score: number }[] = []

    for (const item of pool) {
      if (item.indexGenerationId !== generationId) {
        continue
      }
      if (!Array.isArray(item.embedding) || item.embedding.length !== queryEmbedding.length) {
        continue
      }
      if (item.embedding.some((value) => !Number.isFinite(value))) {
        continue
      }
      const candidateMagnitude = Math.sqrt(item.embedding.reduce((sum, value) => sum + value * value, 0))
      if (!Number.isFinite(candidateMagnitude) || candidateMagnitude <= 0.1) {
        continue
      }
      if (!matchesScope(item, filters)) {
        continue
      }

      const score = cosineSimilarity(queryEmbedding, item.embedding)
      // Filter out low/negative similarity
      if (score > 0) {
        scored.push({ candidate: item, score })
      }
    }

    // Sort descending by cosine similarity score, deterministic tie-breaking
    scored.sort((a, b) => {
      if (Math.abs(b.score - a.score) > 0.00001) return b.score - a.score
      return a.candidate.chunkId.localeCompare(b.candidate.chunkId)
    })

    const topResults = scored.slice(0, limit)

    return topResults.map((item, idx) => ({
      ...item.candidate,
      vectorRank: idx + 1,
      vectorScore: item.score,
    }))
  }
}
