import type { SupabaseClient } from '@supabase/supabase-js'
import { performance } from 'node:perf_hooks'
import type { EmbeddingAdapterConfig, EmbeddingProvider } from '../embedding-adapter'
import { OPENAI_EMBEDDING_GENERATION_ID } from '../embedding-adapter'
import type {
  KnowledgeRetrievalFailureDetails,
  KnowledgeEvidenceItem,
  KnowledgeRetrievalResponse,
  KnowledgeScopeFilter,
  RawChunkCandidate,
  RetrievalMode,
  RetrievalOptions,
} from './contracts'
import { KnowledgeStorageUnavailableError } from './contracts'
import { PostgresFtsAdapter } from './fts-adapter'
import { VectorCandidateAdapter, type VectorIndexedCandidate, type VectorSearchStage } from './vector-adapter'
import { fuseRrfCandidates, type FusedCandidate } from './rrf-fusion'
import { rerankFusedCandidates } from './reranker'
import { expandHierarchyCandidates, type ExpandedCandidate } from './hierarchy-expansion'
import { buildEvidenceContext } from './context-builder'
import { RetrievalTelemetryTracker } from './retrieval-telemetry'

function roundMilliseconds(value: number): number {
  return Math.max(0, Math.round(value * 100) / 100)
}

function classifyFailureReason(message: string): KnowledgeRetrievalFailureDetails['reason'] {
  if (/timed out/i.test(message)) return 'TIMEOUT'
  if (/aborted|abort/i.test(message)) return 'ABORTED'
  return 'ERROR'
}

function mapVectorStage(stage: VectorSearchStage): KnowledgeRetrievalFailureDetails['stage'] {
  return stage === 'VECTOR_RPC' ? 'VECTOR_RPC' : stage === 'IN_MEMORY_VECTOR' ? 'IN_MEMORY_VECTOR' : 'EMBEDDING'
}

function describeVectorStage(stage: VectorSearchStage | KnowledgeRetrievalFailureDetails['stage']): string {
  if (stage === 'EMBEDDING') return 'embedding request'
  if (stage === 'VECTOR_RPC') return 'database vector RPC'
  if (stage === 'IN_MEMORY_VECTOR') return 'in-memory vector search'
  return stage === 'FTS_RPC' ? 'FTS RPC' : stage === 'RUNTIME_STATE_RPC' ? 'runtime-state RPC' : 'candidate fusion'
}

function formatVectorFailure(stage: VectorSearchStage | KnowledgeRetrievalFailureDetails['stage'], message: string): string {
  return classifyFailureReason(message) === 'TIMEOUT'
    ? message
    : `Vector ${describeVectorStage(stage)} failed: ${message}`
}

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

  constructor(options: RetrievalServiceOptions | SupabaseClient = {}) {
    const resolvedOptions: RetrievalServiceOptions = 'from' in options && 'rpc' in options
      ? { client: options as SupabaseClient }
      : options as RetrievalServiceOptions
    this.client = resolvedOptions.client
    this.ftsAdapter = new PostgresFtsAdapter(resolvedOptions.client)
    this.vectorAdapter = new VectorCandidateAdapter(
      resolvedOptions.embeddingConfig,
      resolvedOptions.client,
      resolvedOptions.defaultGenerationId ?? OPENAI_EMBEDDING_GENERATION_ID,
      resolvedOptions.embeddingProvider,
    )
    this.defaultGenerationId =
      resolvedOptions.defaultGenerationId ?? OPENAI_EMBEDDING_GENERATION_ID
  }

  private async resolveRuntimeState(requestedGenerationId?: string, signal?: AbortSignal): Promise<{
    epoch: number
    generationId: string
  }> {
    const startedAt = performance.now()
    const runtimeFailure = (message: string, cause?: unknown) => new KnowledgeStorageUnavailableError(
      message,
      cause,
      {
        phase: 'RUNTIME_STATE',
        stage: 'RUNTIME_STATE_RPC',
        reason: classifyFailureReason(message),
        message,
        elapsedMs: roundMilliseconds(performance.now() - startedAt),
      },
    )
    if (!this.client) {
      return {
        epoch: 1,
        generationId: requestedGenerationId ?? this.defaultGenerationId,
      }
    }

    const request = this.client.rpc('sales_agent_get_knowledge_runtime_state')
    const { data, error } = await (signal && typeof (request as any).abortSignal === 'function'
      ? (request as any).abortSignal(signal)
      : request)

    if (error) {
      throw runtimeFailure(`Runtime state query failed: ${error.message}`, error)
    }

    const epoch = Number(data?.knowledge_epoch)
    const activeGeneration = data?.active_index_generation_id
    if (!Number.isSafeInteger(epoch) || epoch < 1 || !activeGeneration) {
      throw runtimeFailure('Runtime state returned an invalid epoch or generation')
    }

    if (requestedGenerationId && requestedGenerationId !== activeGeneration) {
      throw runtimeFailure(
        `Requested index generation ${requestedGenerationId} is not the active generation ${activeGeneration}`,
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
    if (options.signal?.aborted) throw new Error('Knowledge retrieval aborted')
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
    let runtime: { epoch: number; generationId: string }
    try {
      runtime = cleanQuery
        ? await this.resolveRuntimeState(options.generationId, options.signal)
        : { epoch: 1, generationId: options.generationId ?? this.defaultGenerationId }
    } catch (error) {
      tracker.recordRuntimeState(performance.now() - runtimeStateStartedAt)
      if (error instanceof KnowledgeStorageUnavailableError && error.details) {
        error.details.telemetry = tracker.build(0, 0)
      }
      throw error
    }
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

    // 2-3. First-stage sources run concurrently in hybrid mode. Sharing the
    // request signal means a disconnect cancels both RPCs/embedding work.
    let ftsCandidates: Awaited<ReturnType<PostgresFtsAdapter['searchCandidates']>> = []
    let ftsError: Error | null = null
    let vectorCandidates: Awaited<ReturnType<VectorCandidateAdapter['searchCandidates']>> = []
    let vectorError: Error | null = null
    let vectorStage: VectorSearchStage = 'EMBEDDING'
    let vectorStageStartedAt = performance.now()
    let vectorTimeoutStage: VectorSearchStage | undefined
    let vectorTimeoutStageElapsedMs: number | undefined
    const ftsStartedAt = Date.now()
    const vectorStartedAt = Date.now()
    const runFts = () => this.ftsAdapter.searchCandidates(cleanQuery, filters, effectiveOptions, inMemoryPool)
    const vectorController = new AbortController()
    const forwardAbort = () => vectorController.abort()
    if (mode !== 'FTS') effectiveOptions.signal?.addEventListener('abort', forwardAbort, { once: true })
    const vectorOptions = { ...effectiveOptions, signal: vectorController.signal }
    const runVector = () => this.vectorAdapter.searchCandidates(
      cleanQuery,
      filters,
      vectorOptions,
      inMemoryPool,
      {
        onEmbeddingLatency: (durationMs) => tracker.recordEmbedding(durationMs),
        onVectorSearchLatency: (durationMs) => tracker.recordVectorSearch(durationMs),
        onStageChange: (stage) => {
          vectorStage = stage
          vectorStageStartedAt = performance.now()
        },
      },
    )
    const buildVectorFailureDetails = (message: string): KnowledgeRetrievalFailureDetails => {
      const failedStage = vectorTimeoutStage ?? vectorStage
      const ftsStatus: KnowledgeRetrievalFailureDetails['ftsStatus'] = ftsError
        ? 'ERROR'
        : ftsCandidates.length > 0
          ? 'SUCCESS'
          : 'EMPTY'
      return {
        phase: 'CANDIDATE_SEARCH',
        stage: mapVectorStage(failedStage),
        reason: classifyFailureReason(message),
        message,
        elapsedMs: vectorTimeoutStage
          ? vectorTimeoutStageElapsedMs
          : roundMilliseconds(performance.now() - vectorStageStartedAt),
        timeoutMs: /timed out/i.test(message) ? Math.max(1, options.vectorTimeoutMs ?? 4_000) : undefined,
        ftsStatus,
        ftsCandidateCount: ftsCandidates.length,
        ftsLatencyMs: tracker.build(0, 0).ftsLatencyMs,
        ftsError: ftsError?.message,
        vectorStatus: 'ERROR',
        vectorCandidateCount: vectorCandidates.length,
        vectorLatencyMs: roundMilliseconds(Date.now() - vectorStartedAt),
        vectorStageLatencyMs: vectorTimeoutStage
          ? vectorTimeoutStageElapsedMs
          : roundMilliseconds(performance.now() - vectorStageStartedAt),
        vectorError: message,
        telemetry: tracker.build(0, 0),
      }
    }

    if (mode === 'FTS') {
      try {
        ftsCandidates = await runFts()
      } catch (err: any) {
        ftsError = err instanceof Error ? err : new Error(String(err))
        tracker.recordFts(Date.now() - ftsStartedAt, ftsCandidates.length)
        throw new KnowledgeStorageUnavailableError(`FTS RPC failed: ${ftsError.message}`, ftsError, {
          phase: 'CANDIDATE_SEARCH',
          stage: 'FTS_RPC',
          reason: classifyFailureReason(ftsError.message),
          message: ftsError.message,
          elapsedMs: roundMilliseconds(performance.now() - ftsStartedAt),
          ftsStatus: 'ERROR',
          ftsCandidateCount: ftsCandidates.length,
          ftsLatencyMs: tracker.build(0, 0).ftsLatencyMs,
          ftsError: ftsError.message,
          telemetry: tracker.build(0, 0),
        })
      } finally {
        tracker.recordFts(Date.now() - ftsStartedAt, ftsCandidates.length)
      }
    } else if (mode === 'VECTOR') {
      try {
        vectorCandidates = await runVector()
      } catch (err: any) {
        vectorError = err instanceof Error ? err : new Error(String(err))
      } finally {
        tracker.recordVector(Date.now() - vectorStartedAt, vectorCandidates.length)
      }
    } else {
      const vectorTimeoutMs = Math.max(1, options.vectorTimeoutMs ?? 4_000)
      const runVectorBounded = async () => {
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          return await Promise.race([
            runVector(),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                vectorTimeoutStage = vectorStage
                vectorTimeoutStageElapsedMs = roundMilliseconds(performance.now() - vectorStageStartedAt)
                vectorController.abort()
                const stageLabel = vectorStage === 'EMBEDDING'
                  ? 'embedding request'
                  : vectorStage === 'VECTOR_RPC'
                    ? 'database vector RPC'
                    : 'in-memory vector search'
                reject(new Error(`Vector ${stageLabel} timed out after ${vectorTimeoutMs}ms`))
              }, vectorTimeoutMs)
            }),
          ])
        } finally {
          if (timer) clearTimeout(timer)
        }
      }
      const runFtsMeasured = async () => {
        try {
          ftsCandidates = await runFts()
          return ftsCandidates
        } finally {
          tracker.recordFts(Date.now() - ftsStartedAt, ftsCandidates.length)
        }
      }
      const runVectorMeasured = async () => {
        try {
          vectorCandidates = await runVectorBounded()
          return vectorCandidates
        } finally {
          tracker.recordVector(Date.now() - vectorStartedAt, vectorCandidates.length)
        }
      }
      const [ftsSettled, vectorSettled] = await Promise.allSettled([runFtsMeasured(), runVectorMeasured()])
      if (ftsSettled.status === 'fulfilled') ftsCandidates = ftsSettled.value
      else ftsError = ftsSettled.reason instanceof Error ? ftsSettled.reason : new Error(String(ftsSettled.reason))
      if (vectorSettled.status === 'fulfilled') vectorCandidates = vectorSettled.value
      else vectorError = vectorSettled.reason instanceof Error ? vectorSettled.reason : new Error(String(vectorSettled.reason))
    }
    effectiveOptions.signal?.removeEventListener('abort', forwardAbort)
    if (effectiveOptions.signal?.aborted) throw new Error('Knowledge retrieval aborted')

    // 4. Candidate Fusion & Degradation Logic (A19-KR-308)
    let fusedCandidates: FusedCandidate[] = []
    let actualRetrievalMode = mode

    const fusionStart = Date.now()

    if (mode === 'VECTOR') {
      if (vectorError) {
        throw new KnowledgeStorageUnavailableError(formatVectorFailure(vectorTimeoutStage ?? vectorStage, vectorError.message), vectorError, buildVectorFailureDetails(vectorError.message))
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
        tracker.recordDegradation(
          `${formatVectorFailure(vectorTimeoutStage ?? vectorStage, vectorError.message)}; using ${ftsCandidates.length} FTS candidates`,
        )
        fusedCandidates = ftsCandidates.slice(0, candidateK).map((fts) => ({
          ...fts,
          rrfScore: 1.0 / (60 + fts.ftsRank),
        }))
      } else if (vectorError && ftsCandidates.length === 0) {
        const failureDetails = buildVectorFailureDetails(vectorError.message)
        const ftsDescription = ftsError
          ? `FTS RPC failed: ${ftsError.message}`
          : 'FTS RPC completed with 0 candidates'
        throw new KnowledgeStorageUnavailableError(
          `${formatVectorFailure(failureDetails.stage, vectorError.message)}; ${ftsDescription}`,
          vectorError,
          failureDetails,
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
      const failureDetails = buildVectorFailureDetails(vectorError.message)
      throw new KnowledgeStorageUnavailableError(
        `FTS RPC failed: ${ftsError.message}; ${formatVectorFailure(failureDetails.stage, vectorError.message)}`,
        vectorError,
        failureDetails,
      )
    }
    if (ftsError && vectorCandidates.length === 0 && !vectorError) {
      // A successful empty vector result cannot prove NO_MATCH while the FTS
      // source is unavailable; fail closed instead of returning a false no-hit.
      throw new KnowledgeStorageUnavailableError(`FTS RPC failed: ${ftsError.message}`, ftsError, {
        phase: 'CANDIDATE_SEARCH',
        stage: 'FTS_RPC',
        reason: classifyFailureReason(ftsError.message),
        message: ftsError.message,
        elapsedMs: tracker.build(0, 0).ftsLatencyMs,
        ftsStatus: 'ERROR',
        ftsCandidateCount: ftsCandidates.length,
        ftsLatencyMs: tracker.build(0, 0).ftsLatencyMs,
        ftsError: ftsError.message,
        vectorStatus: 'SUCCESS',
        vectorCandidateCount: vectorCandidates.length,
        vectorLatencyMs: tracker.build(0, 0).vectorLatencyMs,
        telemetry: tracker.build(0, 0),
      })
    }
    if (ftsError && vectorCandidates.length > 0) {
      tracker.recordDegradation(`FTS RPC failed: ${ftsError.message}; using ${vectorCandidates.length} vector candidates`)
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
          selectedCandidates,
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
    if (effectiveOptions.signal?.aborted) throw new Error('Knowledge retrieval aborted')

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
