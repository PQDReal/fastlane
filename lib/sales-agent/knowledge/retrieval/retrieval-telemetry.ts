import { OPENAI_EMBEDDING_GENERATION_ID } from '../embedding-adapter'
import type { KnowledgeRetrievalTelemetry } from './contracts'

export class RetrievalTelemetryTracker {
  private startTime: number
  private runtimeStateLatencyMs = 0
  private ftsLatencyMs = 0
  private embeddingLatencyMs = 0
  private vectorSearchLatencyMs = 0
  private vectorLatencyMs = 0
  private fusionLatencyMs = 0
  private rerankLatencyMs = 0
  private hierarchyLoadLatencyMs = 0
  private expansionLatencyMs = 0
  private contextBuildLatencyMs = 0
  private candidateLimit = 0
  private finalLimit = 0
  private ftsCandidateCount = 0
  private vectorCandidateCount = 0
  private rerankCandidateCount = 0
  private rerankEnabled = false
  private epoch = 1
  private indexGenerationId = OPENAI_EMBEDDING_GENERATION_ID
  private degradedReason?: string

  constructor(
    epoch = 1,
    indexGenerationId = OPENAI_EMBEDDING_GENERATION_ID,
    startTime = Date.now(),
  ) {
    this.startTime = startTime
    this.epoch = epoch
    this.indexGenerationId = indexGenerationId
  }

  setRuntimeState(epoch: number, indexGenerationId: string): void {
    this.epoch = epoch
    this.indexGenerationId = indexGenerationId
  }

  recordRuntimeState(durationMs: number): void {
    this.runtimeStateLatencyMs = Math.max(0, Math.round(durationMs * 100) / 100)
  }

  recordFts(durationMs: number, count: number): void {
    this.ftsLatencyMs = Math.max(0, Math.round(durationMs * 100) / 100)
    this.ftsCandidateCount = count
  }

  recordEmbedding(durationMs: number): void {
    this.embeddingLatencyMs = Math.max(0, Math.round(durationMs * 100) / 100)
  }

  recordVectorSearch(durationMs: number): void {
    this.vectorSearchLatencyMs = Math.max(0, Math.round(durationMs * 100) / 100)
  }

  recordVector(durationMs: number, count: number): void {
    this.vectorLatencyMs = Math.max(0, Math.round(durationMs * 100) / 100)
    this.vectorCandidateCount = count
  }

  recordFusion(durationMs: number): void {
    this.fusionLatencyMs = Math.max(0, Math.round(durationMs * 100) / 100)
  }

  recordRerank(durationMs: number, count: number, enabled: boolean): void {
    this.rerankLatencyMs = Math.max(0, Math.round(durationMs * 100) / 100)
    this.rerankCandidateCount = count
    this.rerankEnabled = enabled
  }

  recordHierarchyLoad(durationMs: number): void {
    this.hierarchyLoadLatencyMs = Math.max(0, Math.round(durationMs * 100) / 100)
  }

  recordExpansion(durationMs: number): void {
    this.expansionLatencyMs = Math.max(0, Math.round(durationMs * 100) / 100)
  }

  recordContextBuild(durationMs: number): void {
    this.contextBuildLatencyMs = Math.max(0, Math.round(durationMs * 100) / 100)
  }

  recordLimits(candidateLimit: number, finalLimit: number): void {
    this.candidateLimit = Math.max(0, Math.floor(candidateLimit))
    this.finalLimit = Math.max(0, Math.floor(finalLimit))
  }

  recordDegradation(reason: string): void {
    this.degradedReason = reason
  }

  build(totalEvidenceCount: number, tokensUsed: number): KnowledgeRetrievalTelemetry {
    const totalLatencyMs = Math.round((Date.now() - this.startTime) * 100) / 100
    return {
      epoch: this.epoch,
      indexGenerationId: this.indexGenerationId,
      runtimeStateLatencyMs: this.runtimeStateLatencyMs,
      ftsLatencyMs: this.ftsLatencyMs,
      embeddingLatencyMs: this.embeddingLatencyMs,
      vectorSearchLatencyMs: this.vectorSearchLatencyMs,
      vectorLatencyMs: this.vectorLatencyMs,
      fusionLatencyMs: this.fusionLatencyMs,
      rerankLatencyMs: this.rerankLatencyMs,
      hierarchyLoadLatencyMs: this.hierarchyLoadLatencyMs,
      expansionLatencyMs: this.expansionLatencyMs,
      contextBuildLatencyMs: this.contextBuildLatencyMs,
      totalLatencyMs,
      candidateLimit: this.candidateLimit,
      finalLimit: this.finalLimit,
      ftsCandidateCount: this.ftsCandidateCount,
      vectorCandidateCount: this.vectorCandidateCount,
      rerankCandidateCount: this.rerankCandidateCount,
      rerankEnabled: this.rerankEnabled,
      totalEvidenceCount,
      tokensUsed,
      degradedReason: this.degradedReason,
    }
  }
}
