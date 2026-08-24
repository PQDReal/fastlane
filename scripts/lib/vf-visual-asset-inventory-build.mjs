import { createHash } from 'node:crypto'

export const VISUAL_ASSET_INVENTORY_SCHEMA_VERSION = '1.0'

const SMALL_DIMENSION_PX = 96
const VERY_SMALL_BYTES = 2_048

function sha256Text(value) {
  return createHash('sha256').update(String(value || '')).digest('hex')
}

function annotationSummary(annotation) {
  return String(annotation?.annotation?.summary || '').trim()
}

export function scoreVisualAnnotation(annotation) {
  if (!annotation) return -1
  const keywords = Array.isArray(annotation.annotation?.keywords)
    ? annotation.annotation.keywords
    : []
  const visibleText = Array.isArray(annotation.visibleText) ? annotation.visibleText : []
  const relations = Array.isArray(annotation.relations) ? annotation.relations : []
  const summary = annotationSummary(annotation)

  let score = 0
  if (annotation.retrievalRecommendation === 'INCLUDE') score += 100
  if (annotation.imageType && annotation.imageType !== 'OTHER') score += 30
  score += Math.round(Number(annotation.confidence || 0) * 20)
  score += Math.min(20, keywords.length * 3)
  score += Math.min(20, visibleText.length * 3)
  score += Math.min(15, relations.length * 3)
  score += Math.min(20, Math.floor(summary.length / 40))
  return score
}

export function assessVisualAssetFilter({ annotation, byteSize, width, height }) {
  const reasonCodes = []
  const pixelCount = Number(width || 0) * Number(height || 0)

  if (annotation?.decision === 'DECORATIVE') reasonCodes.push('ANNOTATION_DECORATIVE')
  if (annotation?.decision === 'UNREADABLE') reasonCodes.push('ANNOTATION_UNREADABLE')
  if (Number(byteSize || 0) < VERY_SMALL_BYTES) reasonCodes.push('VERY_SMALL_BYTES')
  if (
    Number(width || 0) <= SMALL_DIMENSION_PX
    && Number(height || 0) <= SMALL_DIMENSION_PX
  ) {
    reasonCodes.push('SMALL_DIMENSIONS')
  }
  if (annotation?.imageType === 'ICON_MARKER') reasonCodes.push('ICON_MARKER')
  if (annotation?.imageType === 'OTHER') reasonCodes.push('GENERIC_IMAGE_TYPE')
  if (annotation?.retrievalRecommendation === 'REVIEW') reasonCodes.push('AI_REVIEW_REQUIRED')

  let disposition = 'ELIGIBLE_REVIEW'
  if (reasonCodes.includes('ANNOTATION_DECORATIVE')) disposition = 'EXCLUDE_DECORATIVE'
  else if (reasonCodes.includes('ANNOTATION_UNREADABLE')) disposition = 'EXCLUDE_UNREADABLE'
  else if (
    reasonCodes.includes('SMALL_DIMENSIONS')
    || reasonCodes.includes('VERY_SMALL_BYTES')
    || reasonCodes.includes('ICON_MARKER')
  ) {
    disposition = 'REVIEW_POSSIBLE_DECORATIVE'
  }

  return {
    disposition,
    reasonCodes,
    retrievalEnabledCandidate: !disposition.startsWith('EXCLUDE_'),
    pixelCount,
    autoExcluded: disposition.startsWith('EXCLUDE_'),
  }
}

function compactPacketContext(packet) {
  const contexts = Array.isArray(packet?.contexts) ? packet.contexts : []
  return {
    primaryOccurrenceId: String(packet?.primaryOccurrenceId || ''),
    occurrenceIds: Array.isArray(packet?.occurrenceIds) ? packet.occurrenceIds : [],
    vehicleKeys: [...new Set(contexts.map((item) => item?.document?.vehicleKey).filter(Boolean))],
    vehicleModels: [...new Set(contexts.map((item) => item?.document?.vehicleModel).filter(Boolean))],
    modelYears: [...new Set(contexts.map((item) => item?.document?.modelYear).filter(Number.isFinite))],
    documentKeys: [...new Set(contexts.map((item) => item?.document?.documentKey).filter(Boolean))],
    sourceNodeIds: [...new Set(contexts.map((item) => item?.source?.sourceNodeId).filter(Boolean))],
  }
}

function selectCanonicalCandidate(group, annotationsByPacket) {
  const candidates = group.map((item) => {
    const annotation = annotationsByPacket.get(item.packetId)
    return {
      sequence: item.sequence,
      packetId: item.packetId,
      annotation,
      score: scoreVisualAnnotation(annotation),
    }
  }).sort((left, right) => right.score - left.score || left.sequence - right.sequence)

  return candidates[0]
}

function countBy(rows, select) {
  const counts = {}
  for (const row of rows) {
    const key = String(select(row))
    counts[key] = (counts[key] || 0) + 1
  }
  return counts
}

function selectQaRows(assets, disposition, limit, qaLabelsBySha256) {
  return assets
    .filter((asset) => asset.filterAssessment.disposition === disposition)
    .sort((left, right) => left.sha256.localeCompare(right.sha256))
    .slice(0, limit)
    .map((asset) => {
      const qaLabel = qaLabelsBySha256.get(asset.sha256)
      return {
      assetKey: asset.assetKey,
      sha256: asset.sha256,
      representativeSequence: asset.representative.sequence,
      representativePacketId: asset.representative.packetId,
      imagePath: asset.representative.imagePath,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      byteSize: asset.byteSize,
      reuseCount: asset.reuseCount,
      imageType: asset.annotationCandidate.imageType,
      reasonCodes: asset.filterAssessment.reasonCodes,
      expectedQaLabel: qaLabel?.expectedQaLabel || null,
      standaloneEligible: qaLabel?.standaloneEligible ?? null,
      recommendedRole: qaLabel?.recommendedRole || null,
      qaNotes: qaLabel?.qaNotes || '',
      }
    })
}

function qaSampleStatus(strata) {
  const rows = Object.values(strata).flat()
  return rows.length > 0 && rows.every((row) => row.expectedQaLabel)
    ? 'QA_REVIEWED'
    : 'AWAITING_QA_LABELS'
}

export function buildVfVisualAssetInventory({
  mapRows,
  imageRows,
  annotationsByPacket,
  packetsById,
  qaLabelsBySha256 = new Map(),
  qaSamplePerStratum = 30,
}) {
  const mapBySequence = new Map(mapRows.map((row) => [Number(row.sequence), row]))
  const imageBySequence = new Map(imageRows.map((row) => [Number(row.sequence), row]))

  const missingImageSequences = mapRows
    .map((row) => Number(row.sequence))
    .filter((sequence) => !imageBySequence.has(sequence))
  const unexpectedImageSequences = imageRows
    .map((row) => Number(row.sequence))
    .filter((sequence) => !mapBySequence.has(sequence))
  if (missingImageSequences.length || unexpectedImageSequences.length) {
    throw new Error(JSON.stringify({ missingImageSequences, unexpectedImageSequences }))
  }

  const groups = new Map()
  for (const image of imageRows) {
    const mapRow = mapBySequence.get(Number(image.sequence))
    const row = {
      ...image,
      packetId: String(mapRow.packetId),
      sourceUrl: String(mapRow.sourceUrl),
      fileName: String(mapRow.fileName || ''),
      packet: packetsById.get(String(mapRow.packetId)),
    }
    const group = groups.get(image.sha256) || []
    group.push(row)
    groups.set(image.sha256, group)
  }

  const assets = [...groups.entries()].map(([sha256, unsortedGroup]) => {
    const group = [...unsortedGroup].sort((left, right) => left.sequence - right.sequence)
    const representative = group[0]
    const metadataMismatch = group.some((item) => (
      item.byteSize !== representative.byteSize
      || item.mimeType !== representative.mimeType
      || item.width !== representative.width
      || item.height !== representative.height
    ))
    if (metadataMismatch) throw new Error(`Metadata mismatch inside SHA-256 group ${sha256}`)

    const candidate = selectCanonicalCandidate(group, annotationsByPacket)
    const annotation = candidate.annotation
    const summary = annotationSummary(annotation)
    const filterAssessment = assessVisualAssetFilter({
      annotation,
      byteSize: representative.byteSize,
      width: representative.width,
      height: representative.height,
    })
    const manualQaLabel = qaLabelsBySha256.get(sha256)
    const contexts = group.map((item) => ({
      sequence: item.sequence,
      packetId: item.packetId,
      sourceUrl: item.sourceUrl,
      ...compactPacketContext(item.packet),
    }))

    return {
      schemaVersion: VISUAL_ASSET_INVENTORY_SCHEMA_VERSION,
      assetKey: `sha256:${sha256}`,
      sha256,
      byteSize: representative.byteSize,
      mimeType: representative.mimeType,
      format: representative.format,
      width: representative.width,
      height: representative.height,
      reuseCount: group.length,
      annotationVariantCount: new Set(group.map((item) => (
        annotationSummary(annotationsByPacket.get(item.packetId))
      ))).size,
      representative: {
        sequence: representative.sequence,
        packetId: representative.packetId,
        sourceUrl: representative.sourceUrl,
        fileName: representative.fileName,
        imagePath: representative.relativePath,
      },
      annotationCandidate: {
        sequence: candidate.sequence,
        packetId: candidate.packetId,
        score: candidate.score,
        decision: annotation?.decision || 'NEEDS_REVIEW',
        imageType: annotation?.imageType || 'OTHER',
        confidence: Number(annotation?.confidence || 0),
        retrievalRecommendation: annotation?.retrievalRecommendation || 'REVIEW',
        summarySha256: sha256Text(summary),
        keywordCount: Array.isArray(annotation?.annotation?.keywords)
          ? annotation.annotation.keywords.length
          : 0,
        visibleTextCount: Array.isArray(annotation?.visibleText)
          ? annotation.visibleText.length
          : 0,
        relationCount: Array.isArray(annotation?.relations)
          ? annotation.relations.length
          : 0,
      },
      filterAssessment: {
        ...filterAssessment,
        qaLabel: manualQaLabel?.expectedQaLabel || null,
        standaloneEligible: manualQaLabel?.standaloneEligible ?? null,
        recommendedRole: manualQaLabel?.recommendedRole || null,
      },
      occurrences: contexts,
    }
  }).sort((left, right) => left.sha256.localeCompare(right.sha256))

  const occurrenceCount = assets.reduce((sum, asset) => sum + asset.reuseCount, 0)
  const totalUniqueBytes = assets.reduce((sum, asset) => sum + asset.byteSize, 0)
  const totalOccurrenceBytes = imageRows.reduce((sum, image) => sum + image.byteSize, 0)
  const report = {
    schemaVersion: VISUAL_ASSET_INVENTORY_SCHEMA_VERSION,
    status: 'CANONICAL_INVENTORY_READY_FILTER_QA_PENDING',
    mapRowCount: mapRows.length,
    cachedImageCount: imageRows.length,
    annotationCount: annotationsByPacket.size,
    packetCount: packetsById.size,
    assetCount: assets.length,
    occurrenceCount,
    duplicateReuseCount: occurrenceCount - assets.length,
    totalUniqueBytes,
    totalOccurrenceBytes,
    savedBytesByDedupe: totalOccurrenceBytes - totalUniqueBytes,
    assetsWithReuse: assets.filter((asset) => asset.reuseCount > 1).length,
    assetsWithAnnotationVariants: assets.filter((asset) => asset.annotationVariantCount > 1).length,
    mimeTypeCounts: countBy(assets, (asset) => asset.mimeType),
    imageTypeCounts: countBy(assets, (asset) => asset.annotationCandidate.imageType),
    filterDispositionCounts: countBy(assets, (asset) => asset.filterAssessment.disposition),
    autoExcludedCount: assets.filter((asset) => asset.filterAssessment.autoExcluded).length,
    note: 'Filter strata are QA candidates only. No image was deleted, approved, uploaded, embedded, or written to a database.',
  }

  const strata = {
    eligibleReview: selectQaRows(assets, 'ELIGIBLE_REVIEW', qaSamplePerStratum, qaLabelsBySha256),
    possibleDecorative: selectQaRows(assets, 'REVIEW_POSSIBLE_DECORATIVE', qaSamplePerStratum, qaLabelsBySha256),
    excludedDecorative: selectQaRows(assets, 'EXCLUDE_DECORATIVE', qaSamplePerStratum, qaLabelsBySha256),
    excludedUnreadable: selectQaRows(assets, 'EXCLUDE_UNREADABLE', qaSamplePerStratum, qaLabelsBySha256),
  }
  const qaSample = {
    schemaVersion: VISUAL_ASSET_INVENTORY_SCHEMA_VERSION,
    status: qaSampleStatus(strata),
    policy: {
      autoDropEnabled: false,
      samplePerStratum: qaSamplePerStratum,
      acceptance: 'No false drop in the positive knowledge-bearing sample before enabling deterministic exclusion.',
    },
    strata,
  }
  report.qaReviewStatus = qaSample.status
  if (qaSample.status === 'QA_REVIEWED') {
    report.status = 'CANONICAL_INVENTORY_READY_FILTER_QA_REVIEWED'
  }

  return { assets, report, qaSample }
}

export function buildVisualKnowledgeEvalSet({ assets, qaSample, annotationsByPacket }) {
  if (qaSample.status !== 'QA_REVIEWED') {
    throw new Error('Visual eval set requires a fully reviewed QA sample')
  }
  const assetsBySha256 = new Map(assets.map((asset) => [asset.sha256, asset]))
  const rows = Object.values(qaSample.strata).flat()
  const cases = rows.map((row) => {
    const asset = assetsBySha256.get(row.sha256)
    if (!asset) throw new Error(`QA asset is missing from inventory: ${row.sha256}`)
    const annotation = annotationsByPacket.get(asset.annotationCandidate.packetId)
    if (!annotation) throw new Error(`Annotation is missing for ${asset.annotationCandidate.packetId}`)
    const sourceNodeIds = [...new Set(asset.occurrences.flatMap((item) => item.sourceNodeIds))]
    const documentKeys = [...new Set(asset.occurrences.flatMap((item) => item.documentKeys))]
    const vehicleModels = [...new Set(asset.occurrences.flatMap((item) => item.vehicleModels))]
    const modelYears = [...new Set(asset.occurrences.flatMap((item) => item.modelYears))].sort()
    const contextOnly = row.expectedQaLabel === 'CONTEXT_ONLY'
    return {
      caseId: `visual_${row.representativeSequence}_${row.sha256.slice(0, 12)}`,
      categories: contextOnly
        ? ['negative_context_only', 'source_context', 'model_year']
        : ['correct_asset', 'source_context', 'model_year', 'concise_annotation'],
      input: {
        representativeSequence: row.representativeSequence,
        representativePacketId: row.representativePacketId,
      },
      expected: {
        assetSha256: row.sha256,
        sourceNodeIds,
        documentKeys,
        vehicleModels,
        modelYears,
        decision: annotation.decision,
        imageType: annotation.imageType,
        annotationSummarySha256: asset.annotationCandidate.summarySha256,
        requireSourceBoundCitation: true,
        maxRenderedCaptionChars: 500,
        standaloneMedia: !contextOnly,
        role: row.recommendedRole,
      },
      qaEvidence: {
        label: row.expectedQaLabel,
        notes: row.qaNotes,
      },
    }
  })

  return {
    schemaVersion: VISUAL_ASSET_INVENTORY_SCHEMA_VERSION,
    status: 'READY',
    policy: {
      retrievalScope: 'Only APPROVED, active annotation revisions may satisfy positive cases.',
      contextBinding: 'A result must match an evidence source node or section anchor before rendering.',
      negativeHandling: 'CONTEXT_ONLY cases must never render as standalone media.',
    },
    coverage: {
      caseCount: cases.length,
      positiveCount: cases.filter((item) => item.expected.standaloneMedia).length,
      negativeCount: cases.filter((item) => !item.expected.standaloneMedia).length,
      categories: [...new Set(cases.flatMap((item) => item.categories))].sort(),
    },
    cases,
  }
}

export function toJsonLines(rows) {
  return rows.map((row) => JSON.stringify(row)).join('\n') + '\n'
}
