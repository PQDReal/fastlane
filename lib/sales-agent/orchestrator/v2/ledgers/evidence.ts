import type {
  EvidenceRecord,
  FactPointerV2,
  ToolDataProjection,
  ToolObservationRefV2,
  ToolResultV2,
} from '../../../contracts/v2'

export class EvidenceLedger {
  private readonly evidenceRecords = new Map<string, EvidenceRecord>()
  private readonly factIndex = new Map<string, { factPath: string; valueHash: string; evidenceId: string; entityId: string; entityKind: any }>()
  private readonly observations = new Map<string, ToolObservationRefV2>()
  private readonly toolResults = new Map<string, ToolResultV2>()

  recordEvidence(records: EvidenceRecord[]) {
    for (const record of records) {
      this.evidenceRecords.set(record.evidenceId, record)
      for (const fact of record.facts) {
        this.factIndex.set(fact.factRef, {
          factPath: fact.factPath,
          valueHash: fact.valueHash,
          evidenceId: record.evidenceId,
          entityId: record.entity.id,
          entityKind: record.entity.kind,
        })
      }
    }
  }

  recordObservation(observation: ToolObservationRefV2) {
    this.observations.set(observation.observationId, observation)
  }

  recordToolResult(toolCallId: string, result: ToolResultV2) {
    this.toolResults.set(toolCallId, result)
    this.recordObservation(result.observation)
    this.recordEvidence(result.evidence)
  }

  hasFact(factRef: string): boolean {
    return this.factIndex.has(factRef)
  }

  getFact(factRef: string) {
    return this.factIndex.get(factRef)
  }

  hasObservation(observationId: string): boolean {
    return this.observations.has(observationId)
  }

  getObservation(observationId: string): ToolObservationRefV2 | undefined {
    return this.observations.get(observationId)
  }

  getToolResult(toolCallId: string): ToolResultV2 | undefined {
    return this.toolResults.get(toolCallId)
  }

  validateFactPointer(pointer: FactPointerV2): { valid: boolean; reason?: string } {
    const indexed = this.factIndex.get(pointer.factRef)
    if (!indexed) {
      return { valid: false, reason: `Fact pointer '${pointer.factRef}' does not exist in current turn evidence ledger.` }
    }
    if (indexed.evidenceId !== pointer.evidenceId) {
      return { valid: false, reason: `Evidence ID mismatch for fact pointer '${pointer.factRef}'.` }
    }
    if (indexed.entityId !== pointer.entityId) {
      return { valid: false, reason: `Entity ID mismatch for fact pointer '${pointer.factRef}'.` }
    }
    if (indexed.factPath !== pointer.factPath) {
      return { valid: false, reason: `Fact path mismatch for fact pointer '${pointer.factRef}'.` }
    }
    return { valid: true }
  }

  getAllObservations(): ToolObservationRefV2[] {
    return Array.from(this.observations.values())
  }

  getAllEvidence(): EvidenceRecord[] {
    return Array.from(this.evidenceRecords.values())
  }
}
