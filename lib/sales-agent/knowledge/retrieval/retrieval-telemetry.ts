import type { KnowledgeRetrievalTelemetry } from './contracts'

export class RetrievalTelemetryTracker {
  private startTime: number
  private ftsLatencyMs = 0
  private vectorLatencyMs = 0
  private fusionLatencyMs = 0
  private expansionLatencyMs = 0
  private ftsCandidateCount = 0
  private vectorCandidateCount = 0
  private epoch = 1
  private indexGenerationId = 'openai-text-embedding-3-small-1536-v1'
  private degradedReason?: string

  constructor(epoch = 1, indexGenerationId = 'openai-text-embedding-3-small-1536-v1') {
    this.startTime = Date.now()
    this.epoch = epoch
    this.indexGenerationId = indexGenerationId
  }

  recordFts(durationMs: number, count: number): void {
    this.ftsLatencyMs = Math.max(0, Math.round(durationMs * 100) / 100)
    this.ftsCandidateCount = count
  }

  recordVector(durationMs: number, count: number): void {
    this.vectorLatencyMs = Math.max(0, Math.round(durationMs * 100) / 100)
    this.vectorCandidateCount = count
  }

  recordFusion(durationMs: number): void {
    this.fusionLatencyMs = Math.max(0, Math.round(durationMs * 100) / 100)
  }

  recordExpansion(durationMs: number): void {
    this.expansionLatencyMs = Math.max(0, Math.round(durationMs * 100) / 100)
  }

  recordDegradation(reason: string): void {
    this.degradedReason = reason
  }

  build(totalEvidenceCount: number, tokensUsed: number): KnowledgeRetrievalTelemetry {
    const totalLatencyMs = Math.round((Date.now() - this.startTime) * 100) / 100
    return {
      epoch: this.epoch,
      indexGenerationId: this.indexGenerationId,
      ftsLatencyMs: this.ftsLatencyMs,
      vectorLatencyMs: this.vectorLatencyMs,
      fusionLatencyMs: this.fusionLatencyMs,
      expansionLatencyMs: this.expansionLatencyMs,
      totalLatencyMs,
      ftsCandidateCount: this.ftsCandidateCount,
      vectorCandidateCount: this.vectorCandidateCount,
      totalEvidenceCount,
      tokensUsed,
      degradedReason: this.degradedReason,
    }
  }
}
