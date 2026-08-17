import type { FactPointer, ProductType, ToolObservationRef, ToolResult } from '../../contracts'

export type IndexedFact = {
  factRef: string
  evidenceId: string
  entityKind: 'PRODUCT' | 'PROMOTION' | 'KNOWLEDGE_SNIPPET' | 'ORDER'
  entityId: string
  factPath: string
  valueHash: string
}

export type StoredEvidence = {
  evidenceId: string
  source: {
    system: 'SUPABASE' | 'MEMORY' | 'UPSTREAM_API'
    resource: string
  }
  entity: {
    kind: 'PRODUCT' | 'PROMOTION' | 'KNOWLEDGE_SNIPPET' | 'ORDER'
    id: string
  }
  facts: Array<{
    factRef: string
    factPath: string
    valueHash: string
  }>
  readAt: string
  sourceUpdatedAt?: string
}

export class EvidenceLedger {
  private evidenceMap = new Map<string, StoredEvidence>()
  private factsIndex = new Map<string, IndexedFact>()
  private observationsMap = new Map<string, ToolObservationRef>()
  private toolResultsMap = new Map<string, ToolResult>()

  recordEvidence(records: StoredEvidence[]) {
    for (const record of records) {
      this.evidenceMap.set(record.evidenceId, record)
      for (const fact of record.facts) {
        this.factsIndex.set(fact.factRef, {
          factRef: fact.factRef,
          evidenceId: record.evidenceId,
          entityKind: record.entity.kind,
          entityId: record.entity.id,
          factPath: fact.factPath,
          valueHash: fact.valueHash,
        })
      }
    }
  }

  recordObservation(obs: ToolObservationRef) {
    this.observationsMap.set(obs.observationId, obs)
  }

  recordToolResult(toolCallId: string, result: ToolResult) {
    this.toolResultsMap.set(toolCallId, result)
    if (result.evidence && Array.isArray(result.evidence)) {
      this.recordEvidence(result.evidence)
    }
    if (result.observation) {
      this.recordObservation(result.observation)
    }
  }

  hasFact(factRef: string): boolean {
    return this.factsIndex.has(factRef)
  }

  getFact(factRef: string): IndexedFact | undefined {
    return this.factsIndex.get(factRef)
  }

  hasObservation(observationId: string): boolean {
    return this.observationsMap.has(observationId)
  }

  getObservation(observationId: string): ToolObservationRef | undefined {
    return this.observationsMap.get(observationId)
  }

  validateFactPointer(pointer: FactPointer): { valid: boolean; reason?: string } {
    const indexed = this.factsIndex.get(pointer.factRef)
    if (!indexed) {
      return { valid: false, reason: `Fact pointer ${pointer.factRef} không tồn tại trong evidence ledger của lượt này.` }
    }
    if (indexed.evidenceId !== pointer.evidenceId) {
      return { valid: false, reason: `Evidence ID mismatch for ${pointer.factRef}: expected ${indexed.evidenceId}, got ${pointer.evidenceId}` }
    }
    if (indexed.entityKind !== pointer.entityKind || indexed.entityId !== pointer.entityId) {
      return { valid: false, reason: `Entity mismatch for ${pointer.factRef}` }
    }
    if (indexed.factPath !== pointer.factPath) {
      return { valid: false, reason: `Fact path mismatch for ${pointer.factRef}: expected ${indexed.factPath}, got ${pointer.factPath}` }
    }
    return { valid: true }
  }

  getAllFacts(): IndexedFact[] {
    return Array.from(this.factsIndex.values())
  }

  getAllObservations(): ToolObservationRef[] {
    return Array.from(this.observationsMap.values())
  }

  getAllEvidence(): StoredEvidence[] {
    return Array.from(this.evidenceMap.values())
  }
}
