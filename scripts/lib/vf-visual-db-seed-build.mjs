import { createHash } from 'node:crypto'

export const VISUAL_DB_SEED_SCHEMA_VERSION = '1.0'

function sha256(value) {
  return createHash('sha256').update(String(value || '')).digest('hex')
}

function roleForImageType(imageType, disposition) {
  if (disposition?.startsWith('EXCLUDE_')) return 'DECORATIVE'
  if (disposition === 'REVIEW_POSSIBLE_DECORATIVE') return 'INLINE_MARKER'
  const values = {
    DIAGRAM: 'DIAGRAM',
    SCREENSHOT: 'SCREENSHOT',
    WARNING: 'WARNING',
    ICON_MARKER: 'INLINE_MARKER',
  }
  return values[imageType] || 'ILLUSTRATION'
}

function compactLocator(occurrence) {
  const firstChunk = occurrence.chunkRefs?.[0]
  return {
    sourcePath: occurrence.source?.sourcePath || null,
    sectionTitle: occurrence.source?.sectionTitle || null,
    hierarchyPath: occurrence.source?.hierarchyPath || null,
    sectionAnchor: firstChunk?.sectionAnchor || null,
    chunkIndex: Number.isFinite(firstChunk?.chunkIndex) ? firstChunk.chunkIndex : null,
    blockOrdinal: occurrence.position?.blockOrdinal || null,
    imageOrdinalInBlock: occurrence.position?.imageOrdinalInBlock || null,
    placeholder: occurrence.position?.placeholder || null,
  }
}

function compactRelations(occurrence) {
  return {
    documentKeys: occurrence.document?.documentKey
      ? [occurrence.document.documentKey]
      : [],
    vehicleModels: occurrence.document?.vehicleModel
      ? [occurrence.document.vehicleModel]
      : [],
    modelYears: occurrence.document?.modelYear
      ? [occurrence.document.modelYear]
      : [],
    flags: occurrence.context?.flags || {},
    sameBlockOccurrenceIds: (occurrence.relatedImages?.sameBlock || [])
      .slice(0, 8)
      .map((item) => item.occurrenceId),
    nearbyOccurrenceIds: (occurrence.relatedImages?.nearby || [])
      .slice(0, 4)
      .map((item) => item.occurrenceId),
    sameBlockCount: Number(occurrence.relatedImages?.sameBlockCount || 0),
  }
}

function cleanContextFragment(value) {
  return String(value || '')
    .replace(/^\s*\[img:[^\]]+\]\s*$/gimu, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function clippedPrefix(value, limit) {
  const clean = cleanContextFragment(value)
  if (clean.length <= limit) return clean
  return `${clean.slice(0, Math.max(0, limit - 1)).trimEnd()}…`
}

function clippedSuffix(value, limit) {
  const clean = cleanContextFragment(value)
  if (clean.length <= limit) return clean
  return `…${clean.slice(-(Math.max(0, limit - 1))).trimStart()}`
}

export function compactOccurrenceContext(occurrence, maxLength = 180) {
  const context = occurrence.context || {}
  const sourceBlock = cleanContextFragment(context.sourceBlock?.text)
  const sourceBlockWithoutImages = cleanContextFragment(
    sourceBlock.replace(/\[img:[^\]]+\]/giu, ''),
  )
  const sections = []

  const before = clippedSuffix(context.beforeText, sourceBlockWithoutImages ? 42 : 65)
  if (before) sections.push(`Trước ảnh:\n${before}`)
  if (sourceBlockWithoutImages) {
    sections.push(`Cùng khối nguồn:\n${clippedPrefix(sourceBlock, 52)}`)
  }
  const after = clippedPrefix(context.afterText, sourceBlockWithoutImages ? 42 : 75)
  if (after) sections.push(`Sau ảnh:\n${after}`)

  const joined = sections.join('\n\n').trim()
  if (!joined) return null
  return joined.length <= maxLength
    ? joined
    : `${joined.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

export function isStandaloneVisualRetrievalEnabled(filterAssessment) {
  if (!filterAssessment?.retrievalEnabledCandidate) return false
  if (filterAssessment?.disposition === 'REVIEW_POSSIBLE_DECORATIVE') return false
  if (filterAssessment?.qaLabel === 'CONTEXT_ONLY') return false
  if (filterAssessment?.standaloneEligible === false) return false
  return true
}

function annotationPayload(annotation) {
  return {
    decision: annotation.decision,
    imageType: annotation.imageType,
    title: annotation.annotation?.title || '',
    summary: annotation.annotation?.summary || '',
    keywords: annotation.annotation?.keywords || [],
    visibleText: annotation.visibleText || [],
    relations: annotation.relations || [],
    confidence: Number(annotation.confidence || 0),
    retrievalRecommendation: annotation.retrievalRecommendation || 'REVIEW',
    safetyCritical: annotation.safetyCritical === true,
  }
}

function conservativePostgresEstimate({ assets, occurrences, annotations }) {
  const compactBytes = (rows) => rows.reduce(
    (sum, row) => sum + Buffer.byteLength(JSON.stringify(row), 'utf8'),
    0,
  )
  const payloadBytes = {
    assets: compactBytes(assets),
    occurrences: compactBytes(occurrences),
    annotations: compactBytes(annotations),
  }
  const heapBytes = payloadBytes.assets + payloadBytes.occurrences + payloadBytes.annotations
    + (assets.length + occurrences.length + annotations.length) * 72
  const estimatedBtreeBytes = assets.length * 192
    + occurrences.length * 256
    + annotations.length * 224
  const estimatedToastAndAlignmentBytes = Math.ceil(heapBytes * 0.35)
  const estimatedInitialTotalBytes = heapBytes
    + estimatedBtreeBytes
    + estimatedToastAndAlignmentBytes

  return {
    payloadBytes,
    estimatedHeapBytes: heapBytes,
    estimatedBtreeBytes,
    estimatedToastAndAlignmentBytes,
    estimatedInitialTotalBytes,
    estimatedInitialTotalMiB: Number((estimatedInitialTotalBytes / 1024 / 1024).toFixed(2)),
    initialEmbeddingCount: 0,
    note: 'Conservative planning estimate only; disposable PostgreSQL pg_total_relation_size remains authoritative.',
  }
}

export function buildVfVisualDbSeed({
  inventoryAssets,
  visualOccurrences,
  annotationsByPacket,
  documentsByKey = new Map(),
}) {
  const assetByOccurrenceId = new Map()
  for (const asset of inventoryAssets) {
    for (const context of asset.occurrences || []) {
      for (const occurrenceId of context.occurrenceIds || []) {
        if (assetByOccurrenceId.has(occurrenceId)) {
          throw new Error(`Occurrence mapped to multiple assets: ${occurrenceId}`)
        }
        assetByOccurrenceId.set(occurrenceId, asset)
      }
    }
  }

  const assets = inventoryAssets.map((asset) => ({
    schemaVersion: VISUAL_DB_SEED_SCHEMA_VERSION,
    sha256: asset.sha256,
    mimeType: asset.mimeType,
    byteSize: asset.byteSize,
    width: asset.width,
    height: asset.height,
    storageKey: null,
  }))

  const occurrences = visualOccurrences.map((occurrence) => {
    const asset = assetByOccurrenceId.get(occurrence.occurrenceId)
    if (!asset) throw new Error(`Asset missing for occurrence ${occurrence.occurrenceId}`)
    const document = documentsByKey.get(occurrence.document.documentKey)
    if (documentsByKey.size > 0 && !document) {
      throw new Error(`Document build row missing for ${occurrence.document.documentKey}`)
    }
    return {
      schemaVersion: VISUAL_DB_SEED_SCHEMA_VERSION,
      assetSha256: asset.sha256,
      documentKey: occurrence.document.documentKey,
      versionContentChecksum: document?.sourceChecksum || null,
      sourceOccurrenceId: occurrence.occurrenceId,
      sourcePacketId: asset.occurrences.find((context) => (
        (context.occurrenceIds || []).includes(occurrence.occurrenceId)
      ))?.packetId,
      sourceNodeId: occurrence.source.sourceNodeId,
      sourceUrl: occurrence.image.sourceUrl,
      sourceLocator: compactLocator(occurrence),
      ordinal: Number(occurrence.position.canonicalImageOrdinalInSection || 0),
      role: roleForImageType(
        asset.annotationCandidate.imageType,
        asset.filterAssessment.disposition,
      ),
      contextText: compactOccurrenceContext(occurrence),
      relationMetadata: compactRelations(occurrence),
      retrievalEnabled: isStandaloneVisualRetrievalEnabled(asset.filterAssessment),
    }
  })

  const annotations = inventoryAssets.map((asset) => {
    const candidate = asset.annotationCandidate
    const annotation = annotationsByPacket.get(candidate.packetId)
    if (!annotation) throw new Error(`Annotation missing for ${candidate.packetId}`)
    const payload = annotationPayload(annotation)
    const applicabilityModels = [...new Set(
      asset.occurrences.flatMap((context) => context.vehicleModels || []),
    )]
    const summaryMentionsVehicle = /\bVF\s+(?:MPV\s+7|e34|3|5|6|7|8|9)\b/iu
      .test(payload.summary)
    const contentHash = sha256(JSON.stringify(payload))
    return {
      schemaVersion: VISUAL_DB_SEED_SCHEMA_VERSION,
      assetSha256: asset.sha256,
      revisionNo: 1,
      status: 'AI_DRAFT',
      ...payload,
      contentHash,
      sourceAssetSha256: asset.sha256,
      sourcePacketId: candidate.packetId,
      visionProvider: null,
      modelId: null,
      requestId: null,
      promptHash: null,
      provenance: {
        importClass: 'LEGACY_AI_DRAFT',
        sourceWorkbench: 'vf-image-agent',
        providerEvidence: 'legacy_unknown',
        canonicalCandidateScore: candidate.score,
        applicabilityModels,
        requiresIntrinsicSummaryReview: summaryMentionsVehicle && applicabilityModels.length > 1,
        originalNotes: String(annotation.notes || '').slice(0, 500),
      },
    }
  })

  const uniqueAssetHashes = new Set(assets.map((asset) => asset.sha256))
  const uniqueOccurrenceIds = new Set(occurrences.map((item) => item.sourceOccurrenceId))
  if (uniqueAssetHashes.size !== assets.length) throw new Error('Duplicate asset hashes in seed')
  if (uniqueOccurrenceIds.size !== occurrences.length) throw new Error('Duplicate occurrence IDs in seed')

  const capacity = conservativePostgresEstimate({ assets, occurrences, annotations })
  const report = {
    schemaVersion: VISUAL_DB_SEED_SCHEMA_VERSION,
    status: capacity.estimatedInitialTotalMiB <= 25
      ? 'SEED_PLAN_READY_WITHIN_CAPACITY_ESTIMATE'
      : 'SEED_PLAN_EXCEEDS_CAPACITY_ESTIMATE',
    assetCount: assets.length,
    occurrenceCount: occurrences.length,
    annotationCount: annotations.length,
    aiDraftCount: annotations.filter((item) => item.status === 'AI_DRAFT').length,
    approvedCount: annotations.filter((item) => item.status === 'APPROVED').length,
    retrievalDisabledOccurrenceCount: occurrences.filter((item) => !item.retrievalEnabled).length,
    intrinsicSummaryReviewCount: annotations.filter(
      (item) => item.provenance.requiresIntrinsicSummaryReview,
    ).length,
    capacityBudgetMiB: 25,
    capacity,
    note: 'This is a deterministic local seed plan. It does not connect to or mutate a database.',
  }

  return { assets, occurrences, annotations, report }
}

export function toJsonLines(rows) {
  return rows.map((row) => JSON.stringify(row)).join('\n') + '\n'
}
