import { createHash } from 'node:crypto'

import { CATALOG_SPEC_ALIASES, CATALOG_SPEC_DEFINITIONS } from './definitions'
import { extractProductSpecifications } from './extractors'
import { canonicalJson, catalogInputHash, catalogSourceHash } from './hash'
import { SpecRegistry } from './registry'
import { resolveRawSpec } from './resolver'
import { selectCanonicalFact } from './selection'
import { sourceReviewBlockFor, type SourceReviewBlock } from './source-review'
import {
  CATALOG_EXTRACTOR_VERSION,
  CATALOG_SELECTION_POLICY_VERSION,
  type CanonicalFactCandidate,
  type CanonicalValue,
  type CatalogProductInput,
  type ResolvedSpecObservation,
  type SnapshotCompleteness,
  type SpecResolution,
} from './types'

export const CATALOG_PERSISTENCE_PAYLOAD_VERSION = 1 as const

export type CatalogPersistenceCandidate = CanonicalFactCandidate & {
  ordinal: number
}

export type CatalogPersistenceObservation = {
  sourcePath: string
  sourceSchema: string
  sourceUri: string | null
  rawKey: string
  rawValue: unknown
  productVariantId: string | null
  sourceVariantKey: string | null
  resolutionStatus: SpecResolution['status']
  resolutionMethod: 'PATH' | 'LABEL' | null
  definitionKey: string | null
  ignoredReasonCode: string | null
  resolutionReason: string | null
  confidence: number | null
  value: CanonicalValue | null
  candidates: CatalogPersistenceCandidate[]
}

export type CatalogPersistenceFact = {
  definitionKey: string
  contextKey: string
  productVariantId: string | null
  sourceVariantKey: string | null
  sourcePath: string
  candidateOrdinal: number
  value: CanonicalValue
  qualifiers: CanonicalFactCandidate['qualifiers']
  sourceAuthority: ResolvedSpecObservation['sourceAuthority']
  selectionReason: string
  eventFingerprint: string
}

export type CatalogPersistenceEvent = {
  eventType: 'NEW_SPEC_TYPE' | 'CONFLICT' | 'INVALID_VALUE' | 'SOURCE_CONFLICT'
  definitionKey: string | null
  sourcePath: string
  eventFingerprint: string
  payload: Record<string, unknown>
}

export type CatalogPersistencePayload = {
  payloadVersion: typeof CATALOG_PERSISTENCE_PAYLOAD_VERSION
  productId: string
  productName: string
  productType: CatalogProductInput['productType']
  extractorVersion: typeof CATALOG_EXTRACTOR_VERSION
  selectionPolicyVersion: typeof CATALOG_SELECTION_POLICY_VERSION
  snapshotCompleteness: SnapshotCompleteness
  inputHash: string
  sourceHash: string
  sourceUri: string | null
  observedAt: string
  specificationsSnapshot: unknown
  warningCodes: string[]
  sourceReview: null | {
    disposition: SourceReviewBlock['reasonCode']
    reason: string
    evidenceUrls: readonly string[]
    reviewedAt: string
  }
  observations: CatalogPersistenceObservation[]
  canonicalFacts: CatalogPersistenceFact[]
  events: CatalogPersistenceEvent[]
}

type BuildPersistencePayloadOptions = {
  registry?: SpecRegistry
  sourceReview?: (product: CatalogProductInput) => SourceReviewBlock | null
  snapshotCompleteness?: SnapshotCompleteness
}

type CandidateReference = {
  observation: ResolvedSpecObservation
  sourcePath: string
  sourceVariantKey: string | null
  ordinal: number
}

function sha256(value: unknown) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

function normalizedObservedAt(value: string | null | undefined) {
  if (!value) return '1970-01-01T00:00:00.000Z'
  const parsed = new Date(value)
  return Number.isNaN(parsed.valueOf()) ? '1970-01-01T00:00:00.000Z' : parsed.toISOString()
}

function resolutionReason(resolution: Exclude<SpecResolution, { status: 'RESOLVED' }>) {
  if (resolution.status === 'INVALID_VALUE') return resolution.reason
  if (resolution.status === 'AMBIGUOUS') return `Nhiều canonical key cùng khớp: ${resolution.candidateKeys.join(', ')}`
  if (resolution.status === 'IGNORED') return resolution.reason
  if (resolution.status === 'SOURCE_CONFLICT') return resolution.reason
  return 'Chưa có alias deterministic cho specification này.'
}

function unresolvedEvent(
  product: CatalogProductInput,
  inputHash: string,
  observation: CatalogPersistenceObservation,
): CatalogPersistenceEvent | null {
  const eventType = observation.resolutionStatus === 'UNKNOWN_SPEC'
    ? 'NEW_SPEC_TYPE'
    : observation.resolutionStatus === 'AMBIGUOUS'
      ? 'CONFLICT'
      : observation.resolutionStatus === 'INVALID_VALUE'
        ? 'INVALID_VALUE'
        : null
  if (!eventType) return null

  const identity = {
    eventType,
    productId: product.id,
    inputHash,
    sourcePath: observation.sourcePath,
    definitionKey: observation.definitionKey,
    rawKey: observation.rawKey,
    rawValue: observation.rawValue,
  }
  return {
    eventType,
    definitionKey: observation.definitionKey,
    sourcePath: observation.sourcePath,
    eventFingerprint: sha256(identity),
    payload: {
      inputHash,
      rawKey: observation.rawKey,
      rawValue: observation.rawValue,
      reason: observation.resolutionReason,
    },
  }
}

function sourceConflictEvent(
  product: CatalogProductInput,
  inputHash: string,
  review: SourceReviewBlock,
): CatalogPersistenceEvent {
  const identity = {
    eventType: 'SOURCE_CONFLICT',
    productId: product.id,
    inputHash,
    sourcePath: '$snapshot',
    disposition: review.reasonCode,
  }
  return {
    eventType: 'SOURCE_CONFLICT',
    definitionKey: null,
    sourcePath: '$snapshot',
    eventFingerprint: sha256(identity),
    payload: {
      inputHash,
      sourceHash: review.sourceHash,
      disposition: review.reasonCode,
      reason: review.reason,
      evidenceUrls: review.evidenceUrls,
    },
  }
}

export function buildCatalogPersistencePayload(
  product: CatalogProductInput,
  options: BuildPersistencePayloadOptions = {},
): CatalogPersistencePayload {
  const registry = options.registry ?? new SpecRegistry(CATALOG_SPEC_DEFINITIONS, CATALOG_SPEC_ALIASES)
  const findSourceReview = options.sourceReview ?? sourceReviewBlockFor
  const snapshotCompleteness = options.snapshotCompleteness ?? 'FULL'
  const extraction = extractProductSpecifications(product)
  const inputHash = catalogInputHash(product.specifications)
  const sourceHash = catalogSourceHash(product.specifications)
  const observedAt = normalizedObservedAt(product.updatedAt)
  const sourceReview = findSourceReview(product)
  if (sourceReview && sourceReview.sourceHash !== sourceHash) {
    throw new Error(`Source review hash mismatch for product ${product.id}.`)
  }
  const candidateReferences: CandidateReference[] = []
  const events: CatalogPersistenceEvent[] = []

  const observations = extraction.observations.map((raw): CatalogPersistenceObservation => {
    if (sourceReview) {
      return {
        sourcePath: raw.sourcePath,
        sourceSchema: raw.sourceSchema,
        sourceUri: raw.sourceUri,
        rawKey: raw.rawKey,
        rawValue: raw.rawValue,
        productVariantId: raw.productVariantId,
        sourceVariantKey: raw.sourceVariantKey,
        resolutionStatus: 'SOURCE_CONFLICT',
        resolutionMethod: null,
        definitionKey: null,
        ignoredReasonCode: null,
        resolutionReason: sourceReview.reason,
        confidence: null,
        value: null,
        candidates: [],
      }
    }

    const resolution = resolveRawSpec(raw, registry)
    if (resolution.status !== 'RESOLVED') {
      const observation: CatalogPersistenceObservation = {
        sourcePath: raw.sourcePath,
        sourceSchema: raw.sourceSchema,
        sourceUri: raw.sourceUri,
        rawKey: raw.rawKey,
        rawValue: raw.rawValue,
        productVariantId: raw.productVariantId,
        sourceVariantKey: raw.sourceVariantKey,
        resolutionStatus: resolution.status,
        resolutionMethod: null,
        definitionKey: resolution.status === 'INVALID_VALUE' ? resolution.definition.canonicalKey : null,
        ignoredReasonCode: resolution.status === 'IGNORED' ? resolution.reasonCode : null,
        resolutionReason: resolutionReason(resolution),
        confidence: null,
        value: null,
        candidates: [],
      }
      const event = unresolvedEvent(product, inputHash, observation)
      if (event) events.push(event)
      return observation
    }

    const candidates = resolution.facts.map((candidate, ordinal): CatalogPersistenceCandidate => ({
      ...candidate,
      ordinal,
    }))
    for (const candidate of candidates) {
      const observationId = sha256({
        productId: product.id,
        inputHash,
        sourcePath: raw.sourcePath,
        sourceVariantKey: raw.sourceVariantKey,
        ordinal: candidate.ordinal,
      })
      candidateReferences.push({
        sourcePath: raw.sourcePath,
        sourceVariantKey: raw.sourceVariantKey,
        ordinal: candidate.ordinal,
        observation: {
          ...raw,
          observationId,
          snapshotId: inputHash,
          snapshotCompleteness,
          observedAt,
          sourceAuthority: 'AUTO_EXTRACTED',
          definition: resolution.definition,
          value: candidate.value,
          qualifiers: candidate.qualifiers,
          contextKey: candidate.contextKey,
        },
      })
    }

    return {
      sourcePath: raw.sourcePath,
      sourceSchema: raw.sourceSchema,
      sourceUri: raw.sourceUri,
      rawKey: raw.rawKey,
      rawValue: raw.rawValue,
      productVariantId: raw.productVariantId,
      sourceVariantKey: raw.sourceVariantKey,
      resolutionStatus: resolution.status,
      resolutionMethod: resolution.method,
      definitionKey: resolution.definition.canonicalKey,
      ignoredReasonCode: null,
      resolutionReason: null,
      confidence: resolution.confidence,
      value: resolution.value,
      candidates,
    }
  })

  if (sourceReview) events.push(sourceConflictEvent(product, inputHash, sourceReview))

  const groups = new Map<string, CandidateReference[]>()
  for (const reference of candidateReferences) {
    const candidate = reference.observation
    const key = canonicalJson({
      productVariantId: candidate.productVariantId,
      definitionKey: candidate.definition.canonicalKey,
      contextKey: candidate.contextKey,
    })
    groups.set(key, [...(groups.get(key) ?? []), reference])
  }

  const canonicalFacts: CatalogPersistenceFact[] = []
  for (const references of [...groups.values()].sort((left, right) => {
    const a = left[0].observation
    const b = right[0].observation
    return a.definition.canonicalKey.localeCompare(b.definition.canonicalKey)
      || a.contextKey.localeCompare(b.contextKey)
  })) {
    const selection = selectCanonicalFact(null, references.map((reference) => reference.observation))
    if (selection.action === 'CONFLICT' || !selection.selected) {
      const first = references[0]
      events.push({
        eventType: 'CONFLICT',
        definitionKey: first.observation.definition.canonicalKey,
        sourcePath: first.sourcePath,
        eventFingerprint: sha256({
          eventType: 'CONFLICT',
          productId: product.id,
          inputHash,
          definitionKey: first.observation.definition.canonicalKey,
          contextKey: first.observation.contextKey,
          observationIds: selection.conflictingObservationIds,
        }),
        payload: {
          inputHash,
          contextKey: first.observation.contextKey,
          reason: selection.reason,
          conflictingObservationIds: selection.conflictingObservationIds,
        },
      })
      continue
    }

    const selectedReference = references.find((reference) => (
      reference.observation.observationId === selection.selected?.observationId
    ))!
    const selected = selectedReference.observation
    canonicalFacts.push({
      definitionKey: selected.definition.canonicalKey,
      contextKey: selected.contextKey,
      productVariantId: selected.productVariantId,
      sourceVariantKey: selected.sourceVariantKey,
      sourcePath: selectedReference.sourcePath,
      candidateOrdinal: selectedReference.ordinal,
      value: selected.value,
      qualifiers: selected.qualifiers,
      sourceAuthority: selected.sourceAuthority,
      selectionReason: selection.reason,
      eventFingerprint: sha256({
        productId: product.id,
        inputHash,
        definitionKey: selected.definition.canonicalKey,
        contextKey: selected.contextKey,
        value: selected.value,
        qualifiers: selected.qualifiers,
      }),
    })
  }

  return {
    payloadVersion: CATALOG_PERSISTENCE_PAYLOAD_VERSION,
    productId: product.id,
    productName: product.name,
    productType: product.productType,
    extractorVersion: CATALOG_EXTRACTOR_VERSION,
    selectionPolicyVersion: CATALOG_SELECTION_POLICY_VERSION,
    snapshotCompleteness,
    inputHash,
    sourceHash,
    sourceUri: observations.find((observation) => observation.sourceUri)?.sourceUri ?? null,
    observedAt,
    specificationsSnapshot: product.specifications,
    warningCodes: extraction.warnings.map((warning) => warning.code).sort(),
    sourceReview: sourceReview ? {
      disposition: sourceReview.reasonCode,
      reason: sourceReview.reason,
      evidenceUrls: sourceReview.evidenceUrls,
      reviewedAt: sourceReview.reviewedAt,
    } : null,
    observations: observations.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath)),
    canonicalFacts: canonicalFacts.sort((left, right) => (
      left.definitionKey.localeCompare(right.definitionKey)
      || left.contextKey.localeCompare(right.contextKey)
      || left.sourcePath.localeCompare(right.sourcePath)
    )),
    events: events.sort((left, right) => left.eventFingerprint.localeCompare(right.eventFingerprint)),
  }
}
