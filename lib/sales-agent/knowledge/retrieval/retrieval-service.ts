import type { SupabaseClient } from '@supabase/supabase-js'
import { performance } from 'node:perf_hooks'
import type { EmbeddingAdapterConfig, EmbeddingProvider } from '../embedding-adapter'
import { OPENAI_EMBEDDING_GENERATION_ID } from '../embedding-adapter'
import type {
  KnowledgeEvidenceItem,
  KnowledgeRetrievalResponse,
  KnowledgeScopeFilter,
  RawChunkCandidate,
  RetrievalMode,
  RetrievalOptions,
} from './contracts'
import { KnowledgeStorageUnavailableError } from './contracts'
import { PostgresFtsAdapter } from './fts-adapter'
import { VectorCandidateAdapter, type VectorIndexedCandidate } from './vector-adapter'
import { fuseRrfCandidates, type FusedCandidate } from './rrf-fusion'
import { rerankFusedCandidates } from './reranker'
import { expandHierarchyCandidates, type ExpandedCandidate } from './hierarchy-expansion'
import { buildEvidenceContext } from './context-builder'
import { RetrievalTelemetryTracker } from './retrieval-telemetry'

export interface RetrievalServiceOptions {
  client?: SupabaseClient
  embeddingConfig?: EmbeddingAdapterConfig
  defaultGenerationId?: string
  embeddingProvider?: EmbeddingProvider
}

export class HybridHierarchicalRetrievalService {
  private ftsAdapter: PostgresFtsAdapter
  private vectorAdapter: VectorCandidateAdapter
  private defaultGenerationId: string
  private client?: SupabaseClient

  constructor(options: RetrievalServiceOptions = {}) {
    this.client = options.client
    this.ftsAdapter = new PostgresFtsAdapter(options.client)
    this.vectorAdapter = new VectorCandidateAdapter(
      options.embeddingConfig,
      options.client,
      options.defaultGenerationId ?? OPENAI_EMBEDDING_GENERATION_ID,
      options.embeddingProvider,
    )
    this.defaultGenerationId =
      options.defaultGenerationId ?? OPENAI_EMBEDDING_GENERATION_ID
  }

  private async resolveRuntimeState(requestedGenerationId?: string): Promise<{
    epoch: number
    generationId: string
  }> {
    if (!this.client) {
      return {
        epoch: 1,
        generationId: requestedGenerationId ?? this.defaultGenerationId,
      }
    }

    const { data, error } = await this.client.rpc('sales_agent_get_knowledge_runtime_state')

    if (error) {
      throw new KnowledgeStorageUnavailableError(`Runtime state query failed: ${error.message}`, error)
    }

    const epoch = Number(data?.knowledge_epoch)
    const activeGeneration = data?.active_index_generation_id
    if (!Number.isSafeInteger(epoch) || epoch < 1 || !activeGeneration) {
      throw new KnowledgeStorageUnavailableError('Runtime state returned an invalid epoch or generation')
    }

    if (requestedGenerationId && requestedGenerationId !== activeGeneration) {
      throw new KnowledgeStorageUnavailableError(
        `Requested index generation ${requestedGenerationId} is not the active generation ${activeGeneration}`
      )
    }

    return {
      epoch,
      generationId: requestedGenerationId ?? activeGeneration,
    }
  }

  /**
   * Truy xuất tri thức theo kiến trúc Hybrid Hierarchical RAG (A19-KR-300..308)
   */
  async retrieve(
    query: string,
    rawFilters: KnowledgeScopeFilter = {},
    options: RetrievalOptions = {},
    inMemoryPool?: VectorIndexedCandidate[]
  ): Promise<KnowledgeRetrievalResponse> {
    // 1. Server-bound filter normalization
    const filters: KnowledgeScopeFilter = {
      ...rawFilters,
      market: rawFilters.market ?? 'VN',
      locale: rawFilters.locale ?? 'vi-VN',
      effectiveAt: rawFilters.effectiveAt ?? new Date().toISOString(),
    }

    const mode: RetrievalMode = options.retrievalMode ?? 'HYBRID_HIERARCHICAL'
    const cleanQuery = query?.trim() || ''
    const finalK = Math.max(1, options.topK ?? 5)
    const candidateK = Math.max(
      finalK,
      Math.min(options.rerankCandidateLimit ?? 10, 50),
    )

    const retrievalStartedAt = Date.now()
    const tracker = new RetrievalTelemetryTracker(
      1,
      options.generationId ?? this.defaultGenerationId,
      retrievalStartedAt,
    )
    tracker.recordLimits(candidateK, finalK)
    const runtimeStateStartedAt = performance.now()
    const runtime = cleanQuery
      ? await this.resolveRuntimeState(options.generationId)
      : { epoch: 1, generationId: options.generationId ?? this.defaultGenerationId }
    tracker.recordRuntimeState(performance.now() - runtimeStateStartedAt)
    tracker.setRuntimeState(runtime.epoch, runtime.generationId)
    const effectiveOptions: RetrievalOptions = {
      ...options,
      generationId: runtime.generationId,
      // Keep each first-stage source bounded to the internal rerank pool unless
      // a caller explicitly requests a wider candidate window.
      ftsCandidateLimit: options.ftsCandidateLimit ?? candidateK,
      vectorCandidateLimit: options.vectorCandidateLimit ?? candidateK,
    }

    if (!cleanQuery) {
      return {
        status: 'NO_MATCH',
        query: cleanQuery,
        filters,
        retrievalMode: mode,
        items: [],
        totalFound: 0,
        telemetry: tracker.build(0, 0),
      }
    }

    // 2. FTS Candidate Search Phase
    let ftsCandidates: Awaited<ReturnType<PostgresFtsAdapter['searchCandidates']>> = []
    let ftsError: Error | null = null
    const ftsStart = Date.now()
    if (mode !== 'VECTOR') {
      try {
        ftsCandidates = await this.ftsAdapter.searchCandidates(
          cleanQuery,
          filters,
          effectiveOptions,
          inMemoryPool
        )
      } catch (err: any) {
        ftsError = err instanceof Error ? err : new Error(String(err))
        if (mode === 'FTS') {
          throw new KnowledgeStorageUnavailableError(`FTS search failed: ${err.message}`, err)
        }
        // If in hybrid mode, log and continue to attempt vector
      }
    }
    tracker.recordFts(Date.now() - ftsStart, ftsCandidates.length)

    // 3. Vector Candidate Search Phase
    let vectorCandidates: Awaited<ReturnType<VectorCandidateAdapter['searchCandidates']>> = []
    let vectorError: Error | null = null
    const vecStart = Date.now()

    if (mode !== 'FTS') {
      try {
        vectorCandidates = await this.vectorAdapter.searchCandidates(
          cleanQuery,
          filters,
          effectiveOptions,
          inMemoryPool,
          {
            onEmbeddingLatency: (durationMs) => tracker.recordEmbedding(durationMs),
            onVectorSearchLatency: (durationMs) => tracker.recordVectorSearch(durationMs),
          },
        )
      } catch (err: any) {
        vectorError = err
      }
    }
    tracker.recordVector(Date.now() - vecStart, vectorCandidates.length)

    // 4. Candidate Fusion & Degradation Logic (A19-KR-308)
    let fusedCandidates: FusedCandidate[] = []
    let actualRetrievalMode = mode

    const fusionStart = Date.now()

    if (mode === 'VECTOR') {
      if (vectorError) {
        throw new KnowledgeStorageUnavailableError(`Vector search failed: ${vectorError.message}`, vectorError)
      }
      fusedCandidates = vectorCandidates.slice(0, candidateK).map((vec) => ({
        ...vec,
        rrfScore: 1.0 / (60 + vec.vectorRank),
      }))
    } else if (mode === 'FTS') {
      fusedCandidates = ftsCandidates.slice(0, candidateK).map((fts) => ({
        ...fts,
        rrfScore: 1.0 / (60 + fts.ftsRank),
      }))
    } else {
      // Hybrid Modes (HYBRID_RRF, HYBRID_HIERARCHICAL)
      if (vectorError && ftsCandidates.length > 0) {
        // Degrade to FTS-only (A19-KR-308)
        actualRetrievalMode = 'DEGRADED_FTS'
        tracker.recordDegradation(`Vector search failed: ${vectorError.message}`)
        fusedCandidates = ftsCandidates.slice(0, candidateK).map((fts) => ({
          ...fts,
          rrfScore: 1.0 / (60 + fts.ftsRank),
        }))
      } else if (vectorError && ftsCandidates.length === 0) {
        throw new KnowledgeStorageUnavailableError(
          `Both Vector and FTS candidate searches failed: ${vectorError.message}`,
          vectorError
        )
      } else {
        // Full Hybrid RRF Fusion
        fusedCandidates = fuseRrfCandidates(ftsCandidates, vectorCandidates, {
          k: options.rrfK ?? 60,
          weightFts: options.rrfWeights?.fts ?? 1.0,
          weightVector: options.rrfWeights?.vector ?? 1.0,
          minScoreThreshold: options.minScoreThreshold ?? 0.0,
          limit: candidateK,
        })
      }
    }

    if (ftsError && vectorError && ftsCandidates.length === 0 && vectorCandidates.length === 0) {
      throw new KnowledgeStorageUnavailableError(
        `Both FTS and vector candidate searches failed: ${ftsError.message}; ${vectorError.message}`,
        vectorError
      )
    }
    if (ftsError && vectorCandidates.length === 0 && !vectorError) {
      // A successful empty vector result cannot prove NO_MATCH while the FTS
      // source is unavailable; fail closed instead of returning a false no-hit.
      throw new KnowledgeStorageUnavailableError(`FTS search failed: ${ftsError.message}`, ftsError)
    }
    if (ftsError && vectorCandidates.length > 0) {
      tracker.recordDegradation(`FTS search failed: ${ftsError.message}; using vector candidates`)
    }

    tracker.recordFusion(Date.now() - fusionStart)

    if (fusedCandidates.length === 0) {
      return {
        status: 'NO_MATCH',
        query: cleanQuery,
        filters,
        retrievalMode: actualRetrievalMode,
        items: [],
        totalFound: 0,
        telemetry: tracker.build(0, 0),
      }
    }

    // 5. Backend reranking phase. Only the small candidate set is reranked;
    // the raw DB result is never sent to the Agent.
    const rerankEnabled = options.enableRerank !== false
    const rerankStart = performance.now()
    let rankedCandidates: FusedCandidate[] = fusedCandidates.slice(0, candidateK)
    if (rerankEnabled) {
      try {
        rankedCandidates = rerankFusedCandidates(cleanQuery, rankedCandidates, {
          limit: candidateK,
          filters,
        })
      } catch (err: any) {
        // Rerank is an optimization layer; preserve grounded RRF results if it
        // ever fails so retrieval remains available.
        tracker.recordDegradation(`Rerank unavailable: ${err?.message || 'unknown error'}`)
      }
    }
    tracker.recordRerank(performance.now() - rerankStart, rankedCandidates.length, rerankEnabled)

    // The Agent-facing context is always bounded by finalK. Hierarchy
    // expansion runs only for reranked winners to avoid reintroducing low-
    // relevance candidates after reranking.
    const selectedCandidates = rankedCandidates.slice(0, finalK)

    // 6. Hierarchy Expansion Phase (A19-KR-304)
    const expansionStart = performance.now()
    let expandedCandidates: ExpandedCandidate[] = selectedCandidates.map((c) => ({
      ...c,
      expansionProvenance: 'DIRECT' as const,
    }))

    let hierarchyPool: RawChunkCandidate[] | undefined = inMemoryPool
    const hierarchyLoadStart = performance.now()
    let hierarchyLoadLatencyMs = 0
    if (!hierarchyPool && this.client && selectedCandidates.length > 0) {
      try {
        hierarchyPool = await this.ftsAdapter.loadHierarchyContext(
          selectedCandidates.map((candidate) => candidate.versionId),
          filters,
          effectiveOptions
        )
      } catch (err: any) {
        // Direct evidence remains valid; expansion is optional context. Keep
        // the failure visible in telemetry and never widen to another version.
        tracker.recordDegradation(`Hierarchy context unavailable: ${err?.message || 'unknown error'}`)
        hierarchyPool = []
      }
    }
    hierarchyLoadLatencyMs = performance.now() - hierarchyLoadStart
    tracker.recordHierarchyLoad(hierarchyLoadLatencyMs)

    if (actualRetrievalMode === 'HYBRID_HIERARCHICAL' && options.enableHierarchyExpansion !== false) {
      expandedCandidates = expandHierarchyCandidates(
        selectedCandidates,
        hierarchyPool,
        {
          enableParentExpansion: true,
          enableNeighborExpansion: true,
          maxNeighborsPerHit: 1,
        }
      )
    }
    tracker.recordExpansion(Math.max(0, performance.now() - expansionStart - hierarchyLoadLatencyMs))

    // 6. Context Deduplication & Token Budgeting (A19-KR-305)
    const contextBuildStart = performance.now()
    const { items, totalTokensUsed } = buildEvidenceContext(expandedCandidates, {
      topK: finalK,
      tokenBudget: options.tokenBudget ?? 2500,
      retrievalMode: actualRetrievalMode,
    })
    tracker.recordContextBuild(performance.now() - contextBuildStart)

    const status =
      items.length === 0
        ? 'NO_MATCH'
        : actualRetrievalMode === 'DEGRADED_FTS'
          ? 'DEGRADED_FTS'
          : 'SUCCESS'

    return {
      status,
      query: cleanQuery,
      filters,
      retrievalMode: actualRetrievalMode,
      items,
      totalFound: items.length,
      telemetry: tracker.build(items.length, totalTokensUsed),
    }
  }
}
