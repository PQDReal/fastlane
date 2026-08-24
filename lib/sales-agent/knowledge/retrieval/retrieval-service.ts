import type { SupabaseClient } from '@supabase/supabase-js'
import type { EmbeddingAdapterConfig } from '../embedding-adapter'
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
import { expandHierarchyCandidates, type ExpandedCandidate } from './hierarchy-expansion'
import { buildEvidenceContext } from './context-builder'
import { RetrievalTelemetryTracker } from './retrieval-telemetry'

export interface RetrievalServiceOptions {
  client?: SupabaseClient
  embeddingConfig?: EmbeddingAdapterConfig
  defaultGenerationId?: string
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
      options.defaultGenerationId
    )
    this.defaultGenerationId =
      options.defaultGenerationId ?? 'openai-text-embedding-3-small-1536-v1'
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

    const { data, error } = await this.client
      .from('sales_agent_knowledge_runtime_state')
      .select('knowledge_epoch, active_index_generation_id')
      .eq('singleton_id', 1)
      .maybeSingle()

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

    const runtime = cleanQuery
      ? await this.resolveRuntimeState(options.generationId)
      : { epoch: 1, generationId: options.generationId ?? this.defaultGenerationId }
    const tracker = new RetrievalTelemetryTracker(runtime.epoch, runtime.generationId)
    const effectiveOptions: RetrievalOptions = {
      ...options,
      generationId: runtime.generationId,
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
          inMemoryPool
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
      fusedCandidates = vectorCandidates.map((vec) => ({
        ...vec,
        rrfScore: 1.0 / (60 + vec.vectorRank),
      }))
    } else if (mode === 'FTS') {
      fusedCandidates = ftsCandidates.map((fts) => ({
        ...fts,
        rrfScore: 1.0 / (60 + fts.ftsRank),
      }))
    } else {
      // Hybrid Modes (HYBRID_RRF, HYBRID_HIERARCHICAL)
      if (vectorError && ftsCandidates.length > 0) {
        // Degrade to FTS-only (A19-KR-308)
        actualRetrievalMode = 'DEGRADED_FTS'
        tracker.recordDegradation(`Vector search failed: ${vectorError.message}`)
        fusedCandidates = ftsCandidates.map((fts) => ({
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
          limit: (options.topK ?? 4) * 3, // Fetch sufficient candidates for hierarchy expansion
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

    // 5. Hierarchy Expansion Phase (A19-KR-304)
    const expansionStart = Date.now()
    let expandedCandidates: ExpandedCandidate[] = fusedCandidates.map((c) => ({
      ...c,
      expansionProvenance: 'DIRECT' as const,
    }))

    let hierarchyPool: RawChunkCandidate[] | undefined = inMemoryPool
    if (!hierarchyPool && this.client && fusedCandidates.length > 0) {
      try {
        hierarchyPool = await this.ftsAdapter.loadHierarchyContext(
          fusedCandidates.map((candidate) => candidate.versionId),
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

    if (actualRetrievalMode === 'HYBRID_HIERARCHICAL' && options.enableHierarchyExpansion !== false) {
      expandedCandidates = expandHierarchyCandidates(
        fusedCandidates,
        hierarchyPool,
        {
          enableParentExpansion: true,
          enableNeighborExpansion: true,
          maxNeighborsPerHit: 1,
        }
      )
    }
    tracker.recordExpansion(Date.now() - expansionStart)

    // 6. Context Deduplication & Token Budgeting (A19-KR-305)
    const { items, totalTokensUsed } = buildEvidenceContext(expandedCandidates, {
      topK: options.topK ?? 4,
      tokenBudget: options.tokenBudget ?? 2500,
      retrievalMode: actualRetrievalMode,
    })

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
