import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

import { canonicalizeDocumentContent } from '../../lib/sales-agent/knowledge/canonicalizer.ts'

export const VISUAL_ANALYSIS_SCHEMA_VERSION = '1.0'
export const DEFAULT_ANNOTATION_SCHEMA_REF = 'scripts/data/vf-visual-annotation-output.schema.json'

const IMAGE_PLACEHOLDER_PATTERN = /\[img:\s*([^\]]+)\]/g
const RAW_IMAGE_PATTERN = /<img\b([^>]*)\/?>|!\[([^\]]*)\]\(([^)]+)\)/gi
const MAX_IMMEDIATE_CONTEXT_CHARS = 900
const MAX_BLOCK_CONTEXT_CHARS = 3_500
const MAX_ADJACENT_BLOCK_CHARS = 1_500
const MAX_RELATED_IMAGES = 24
const MAX_CONTEXTS_PER_PACKET = 8

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function cleanSourceUrl(value) {
  return String(value || '')
    .trim()
    .replace(/&\s*amp\s*;/gi, '&')
    .split('#id=')[0]
}

function imageFileName(url, fallback = 'image') {
  return cleanSourceUrl(url).split('/').pop()?.split('#')[0]?.split('?')[0] || fallback
}

function clipTail(value, maxChars) {
  const text = String(value || '').trim()
  if (text.length <= maxChars) return { text, truncated: false }
  return { text: text.slice(text.length - maxChars).trimStart(), truncated: true }
}

function clipHead(value, maxChars) {
  const text = String(value || '').trim()
  if (text.length <= maxChars) return { text, truncated: false }
  return { text: text.slice(0, maxChars).trimEnd(), truncated: true }
}

function clipAround(value, start, end, maxChars) {
  const text = String(value || '')
  if (text.length <= maxChars) return { text: text.trim(), truncated: false }
  const center = Math.floor((start + end) / 2)
  const from = Math.max(0, Math.min(text.length - maxChars, center - Math.floor(maxChars / 2)))
  return {
    text: text.slice(from, from + maxChars).trim(),
    truncated: true,
  }
}

function extractAttribute(attributes, name) {
  const match = String(attributes || '').match(new RegExp('\\b' + name + '=["\\\']([^"\\\']*)["\\\']', 'i'))
  return match ? match[1].trim() : undefined
}

export function extractRawImageOccurrences(rawMarkdown) {
  const occurrences = []
  RAW_IMAGE_PATTERN.lastIndex = 0

  for (const match of String(rawMarkdown || '').matchAll(RAW_IMAGE_PATTERN)) {
    if (match[1] !== undefined) {
      const sourceUrl = cleanSourceUrl(extractAttribute(match[1], 'src'))
      if (!sourceUrl) continue
      const id = extractAttribute(match[1], 'id')
      const alt = extractAttribute(match[1], 'alt') || (id ? 'figure-' + id : 'image')
      occurrences.push({
        sourceUrl,
        fileName: imageFileName(sourceUrl, id ? 'figure-' + id : 'image'),
        alt,
        id,
        sourceSyntax: 'HTML_IMG',
        rawOffset: match.index,
      })
      continue
    }

    const sourceUrl = cleanSourceUrl(match[3])
    if (!sourceUrl) continue
    const id = String(match[3] || '').split('#id=')[1] || undefined
    occurrences.push({
      sourceUrl,
      fileName: imageFileName(sourceUrl, id ? 'figure-' + id : 'image'),
      alt: String(match[2] || '').trim() || (id ? 'figure-' + id : 'image'),
      id,
      sourceSyntax: 'MARKDOWN_IMAGE',
      rawOffset: match.index,
    })
  }

  return occurrences
}

export function splitDocumentSections(contentMarkdown) {
  const content = String(contentMarkdown || '')
  const markerPattern = /<!-- source_node_id:([^;]+); path:([^>]+) -->\r?\n/g
  const markers = [...content.matchAll(markerPattern)]

  return markers.map((marker, index) => {
    const start = Number(marker.index) + marker[0].length
    const end = index + 1 < markers.length ? Number(markers[index + 1].index) : content.length
    const rawMarkdown = content
      .slice(start, end)
      .replace(/\r?\n\s*---\s*\r?\n\s*$/, '')
      .trim()
    return {
      sourceNodeId: marker[1].trim(),
      sourcePath: marker[2].trim(),
      rawMarkdown,
    }
  })
}

function logicalBlocks(markdown) {
  const text = String(markdown || '')
  const parts = text.split(/\n\s*\n+/).map((part) => part.trim()).filter(Boolean)
  let cursor = 0
  return parts.map((part, index) => {
    const start = text.indexOf(part, cursor)
    const safeStart = start >= 0 ? start : cursor
    cursor = safeStart + part.length
    return {
      index,
      start: safeStart,
      end: safeStart + part.length,
      text: part,
    }
  })
}

function findBlock(blocks, offset) {
  return blocks.find((block) => offset >= block.start && offset <= block.end)
    || blocks.at(-1)
    || { index: 0, start: 0, end: 0, text: '' }
}

function collectAdjacentBlocks(blocks, blockIndex, direction) {
  const selected = []
  let usedChars = 0
  let index = blockIndex + direction
  while (index >= 0 && index < blocks.length && usedChars < MAX_ADJACENT_BLOCK_CHARS) {
    const block = blocks[index]
    const remaining = MAX_ADJACENT_BLOCK_CHARS - usedChars
    const clipped = direction < 0 ? clipTail(block.text, remaining) : clipHead(block.text, remaining)
    if (clipped.text) selected.push(clipped.text)
    usedChars += clipped.text.length
    index += direction
  }
  if (direction < 0) selected.reverse()
  return selected
}

function sectionTitleWithoutPart(value) {
  return String(value || '').replace(/\s*\(Phần\s+\d+\)\s*$/i, '').trim()
}

function nodeKey(documentKey, sourceNodeId) {
  return String(documentKey || '') + '\u0000' + String(sourceNodeId || '')
}

function compactChunkRef(chunk) {
  return {
    chunkIndex: Number(chunk.chunkIndex),
    chunkLevel: Number(chunk.chunkLevel),
    hierarchyPath: String(chunk.hierarchyPath || ''),
    sectionAnchor: String(chunk.sectionAnchor || ''),
    contentHash: String(chunk.contentHash || ''),
  }
}

function compactRelatedImage(occurrence) {
  return {
    occurrenceId: occurrence.occurrenceId,
    sourceUrl: occurrence.image.sourceUrl,
    fileName: occurrence.image.fileName,
    imageOrdinalInSection: occurrence.position.imageOrdinalInSection,
    imageOrdinalInBlock: occurrence.position.imageOrdinalInBlock,
  }
}

function contextScore(occurrence) {
  const context = occurrence.context
  let score = Math.min(40, Math.floor(context.sourceBlock.text.length / 100))
  if (context.flags.isTable) score += 15
  if (context.flags.isProcedure) score += 15
  if (context.flags.isWarning) score += 15
  if (context.beforeText) score += 5
  if (context.afterText) score += 5
  score += Math.min(10, occurrence.relatedImages.sameBlockCount)
  return score
}

function buildSectionOccurrences({
  document,
  section,
  chunkRows,
  annotationSchemaRef,
  mappingIssues,
}) {
  const canonical = canonicalizeDocumentContent(section.rawMarkdown)
  const rawImages = extractRawImageOccurrences(section.rawMarkdown)
  const placeholders = [...canonical.normalizedMarkdown.matchAll(IMAGE_PLACEHOLDER_PATTERN)]
  const chunksByUrl = new Map()

  for (const chunk of chunkRows) {
    for (const image of Array.isArray(chunk.extractedImages) ? chunk.extractedImages : []) {
      const url = cleanSourceUrl(image?.url)
      if (!url) continue
      const list = chunksByUrl.get(url) || []
      list.push(chunk)
      chunksByUrl.set(url, list)
    }
  }

  const blocks = logicalBlocks(canonical.normalizedMarkdown)
  const draft = []
  const rawImagesByFileName = new Map()
  rawImages.forEach((image, index) => {
    const list = rawImagesByFileName.get(image.fileName) || []
    list.push({ image, rawOrdinal: index + 1, used: false })
    rawImagesByFileName.set(image.fileName, list)
  })

  for (let index = 0; index < placeholders.length; index += 1) {
    const placeholder = placeholders[index]
    const placeholderFileName = String(placeholder[1] || '').trim()
    const candidates = rawImagesByFileName.get(placeholderFileName) || []
    const sourceEntry = candidates.find((candidate) => (
      !candidate.used && chunksByUrl.has(candidate.image.sourceUrl)
    )) || candidates.find((candidate) => !candidate.used)

    if (!sourceEntry) {
      mappingIssues.push({
        code: 'PLACEHOLDER_MISSING_SOURCE_IMAGE',
        documentKey: document.documentKey,
        sourceNodeId: section.sourceNodeId,
        canonicalImageOrdinal: index + 1,
        placeholderFileName,
      })
      continue
    }
    sourceEntry.used = true
    const sourceImage = sourceEntry.image

    const matchingChunks = chunksByUrl.get(sourceImage.sourceUrl) || []
    if (matchingChunks.length === 0) continue

    const start = Number(placeholder.index)
    const end = start + placeholder[0].length
    const block = findBlock(blocks, start)
    const before = clipTail(canonical.normalizedMarkdown.slice(0, start), MAX_IMMEDIATE_CONTEXT_CHARS)
    const after = clipHead(canonical.normalizedMarkdown.slice(end), MAX_IMMEDIATE_CONTEXT_CHARS)
    const blockContext = clipAround(block.text, start - block.start, end - block.start, MAX_BLOCK_CONTEXT_CHARS)
    const occurrenceId = 'occ_' + sha256([
      document.documentKey,
      section.sourceNodeId,
      String(sourceEntry.rawOrdinal),
      sourceImage.sourceUrl,
    ].join('\u0000')).slice(0, 32)

    draft.push({
      schemaVersion: VISUAL_ANALYSIS_SCHEMA_VERSION,
      occurrenceId,
      packetSchemaRef: annotationSchemaRef,
      document: {
        editionId: String(document.editionId || ''),
        documentKey: String(document.documentKey || ''),
        vehicleKey: String(document.vehicleKey || ''),
        vehicleModel: String(document.vehicleModel || ''),
        modelYear: Number(document.modelYear),
        locale: String(document.locale || 'vi-VN'),
        market: String(document.market || 'VN'),
        sourceUri: String(document.sourceUri || ''),
      },
      source: {
        sourceNodeId: section.sourceNodeId,
        sourcePath: section.sourcePath,
        sectionTitle: sectionTitleWithoutPart(chunkRows[0]?.sectionTitle),
        hierarchyPath: String(chunkRows[0]?.parentHierarchyPath || chunkRows[0]?.hierarchyPath || ''),
        sectionTextHash: canonical.checksum,
      },
      image: {
        sourceUrl: sourceImage.sourceUrl,
        fileName: sourceImage.fileName,
        alt: sourceImage.alt,
        sourceSyntax: sourceImage.sourceSyntax,
        provisionalUrlHash: sha256(sourceImage.sourceUrl),
        contentSha256: null,
      },
      position: {
        imageOrdinalInSection: sourceEntry.rawOrdinal,
        canonicalImageOrdinalInSection: index + 1,
        imageOrdinalInBlock: 0,
        blockOrdinal: block.index + 1,
        placeholder: placeholder[0],
        placeholderOffset: start,
      },
      context: {
        beforeText: before.text,
        afterText: after.text,
        previousBlocks: collectAdjacentBlocks(blocks, block.index, -1),
        nextBlocks: collectAdjacentBlocks(blocks, block.index, 1),
        sourceBlock: {
          text: blockContext.text,
          truncated: blockContext.truncated,
          hash: sha256(block.text),
        },
        flags: {
          isTable: /^\s*\|/m.test(block.text) || matchingChunks.some((chunk) => chunk.isTable),
          isProcedure: /(?:^|\n)\s*(?:bước\s*\d+|\d+[.)]\s+)/iu.test(block.text)
            || matchingChunks.some((chunk) => chunk.isProcedure),
          isWarning: /CẢNH BÁO|THẬN TRỌNG|LƯU Ý|NGUY HIỂM/iu.test(block.text)
            || matchingChunks.some((chunk) => chunk.isWarning),
          beforeTruncated: before.truncated,
          afterTruncated: after.truncated,
        },
      },
      relatedImages: {
        sameBlock: [],
        sameBlockCount: 0,
        sameBlockTruncated: false,
        nearby: [],
      },
      chunkRefs: matchingChunks.map(compactChunkRef),
    })
  }

  const byBlock = new Map()
  for (const occurrence of draft) {
    const blockOrdinal = occurrence.position.blockOrdinal
    const list = byBlock.get(blockOrdinal) || []
    list.push(occurrence)
    byBlock.set(blockOrdinal, list)
  }

  for (const group of byBlock.values()) {
    group.forEach((occurrence, index) => {
      occurrence.position.imageOrdinalInBlock = index + 1
    })
  }

  for (let index = 0; index < draft.length; index += 1) {
    const occurrence = draft[index]
    const sameBlock = (byBlock.get(occurrence.position.blockOrdinal) || [])
      .filter((candidate) => candidate.occurrenceId !== occurrence.occurrenceId)
    const nearby = draft
      .slice(Math.max(0, index - 2), Math.min(draft.length, index + 3))
      .filter((candidate) => candidate.occurrenceId !== occurrence.occurrenceId)

    occurrence.relatedImages = {
      sameBlock: sameBlock.slice(0, MAX_RELATED_IMAGES).map(compactRelatedImage),
      sameBlockCount: sameBlock.length,
      sameBlockTruncated: sameBlock.length > MAX_RELATED_IMAGES,
      nearby: nearby.map(compactRelatedImage),
    }
  }

  return draft
}

export function buildVfVisualAnalysisData({
  documents,
  chunks,
  annotationSchemaRef = DEFAULT_ANNOTATION_SCHEMA_REF,
}) {
  const vfChunks = chunks.filter((chunk) => (
    typeof chunk.vehicleKey === 'string'
    && chunk.vehicleKey.startsWith('vf-')
  ))
  const chunkNodes = new Map()
  const chunkBackedUrls = new Set()
  let chunkImageUrlOccurrences = 0

  for (const chunk of vfChunks) {
    if (!chunk.sourceNodeId) continue
    const key = nodeKey(chunk.documentKey, chunk.sourceNodeId)
    const list = chunkNodes.get(key) || []
    list.push(chunk)
    chunkNodes.set(key, list)
    for (const image of Array.isArray(chunk.extractedImages) ? chunk.extractedImages : []) {
      const url = cleanSourceUrl(image?.url)
      if (!url) continue
      chunkImageUrlOccurrences += 1
      chunkBackedUrls.add(url)
    }
  }

  for (const rows of chunkNodes.values()) {
    rows.sort((left, right) => Number(left.chunkIndex) - Number(right.chunkIndex))
  }

  const mappingIssues = []
  const occurrences = []
  let vfDocumentCount = 0
  let sourceSectionCount = 0
  let sourceImageOccurrences = 0

  for (const document of documents) {
    if (typeof document.vehicleKey !== 'string' || !document.vehicleKey.startsWith('vf-')) continue
    vfDocumentCount += 1
    for (const section of splitDocumentSections(document.contentMarkdown)) {
      sourceSectionCount += 1
      sourceImageOccurrences += extractRawImageOccurrences(section.rawMarkdown).length
      const rows = chunkNodes.get(nodeKey(document.documentKey, section.sourceNodeId)) || []
      if (rows.length === 0) continue
      occurrences.push(...buildSectionOccurrences({
        document,
        section,
        chunkRows: rows,
        annotationSchemaRef,
        mappingIssues,
      }))
    }
  }

  const occurrenceUrls = new Set(occurrences.map((occurrence) => occurrence.image.sourceUrl))
  const missingSourceUrls = [...chunkBackedUrls].filter((url) => !occurrenceUrls.has(url))
  if (missingSourceUrls.length > 0) {
    mappingIssues.push({
      code: 'CHUNK_URL_MISSING_SOURCE_OCCURRENCE',
      count: missingSourceUrls.length,
      examples: missingSourceUrls.slice(0, 10),
    })
  }

  const assetsByUrl = new Map()
  for (const occurrence of occurrences) {
    const url = occurrence.image.sourceUrl
    const list = assetsByUrl.get(url) || []
    list.push(occurrence)
    assetsByUrl.set(url, list)
  }

  const packets = [...assetsByUrl.entries()].map(([sourceUrl, assetOccurrences]) => {
    const sorted = [...assetOccurrences].sort((left, right) => {
      const scoreDiff = contextScore(right) - contextScore(left)
      return scoreDiff || left.occurrenceId.localeCompare(right.occurrenceId)
    })
    const primary = sorted[0]
    const urlHash = sha256(sourceUrl)
    return {
      schemaVersion: VISUAL_ANALYSIS_SCHEMA_VERSION,
      packetId: 'visual_' + urlHash.slice(0, 32),
      status: 'PENDING_AI_ANALYSIS',
      annotationSchemaRef,
      assetCandidate: {
        provisionalKey: 'url_sha256:' + urlHash,
        sourceUrl,
        fileName: primary.image.fileName,
        contentSha256: null,
        dedupeStatus: 'URL_ONLY_NOT_CONTENT_HASHED',
      },
      occurrenceIds: assetOccurrences.map((occurrence) => occurrence.occurrenceId),
      occurrenceCount: assetOccurrences.length,
      primaryOccurrenceId: primary.occurrenceId,
      contexts: sorted.slice(0, MAX_CONTEXTS_PER_PACKET),
      contextsTruncated: sorted.length > MAX_CONTEXTS_PER_PACKET,
      analysisPolicy: {
        outputLanguage: 'vi-VN',
        conciseSummaryPreferredChars: { min: 300, max: 500 },
        useOnlyVisibleImageAndProvidedContext: true,
        doNotInventUrlsOrAssetIds: true,
        approvalIsServerControlled: true,
        safetyOrProcedureNeedsTextCorroboration: true,
      },
    }
  }).sort((left, right) => left.packetId.localeCompare(right.packetId))

  const occurrencesByUrl = [...assetsByUrl.values()].map((rows) => rows.length)
  const report = {
    schemaVersion: VISUAL_ANALYSIS_SCHEMA_VERSION,
    status: mappingIssues.length === 0
      ? 'LOCAL_PACKETS_VALIDATED_NOT_ANALYZED'
      : 'LOCAL_PACKETS_WITH_MAPPING_ISSUES',
    vfDocumentCount,
    sourceSectionCount,
    sourceImageOccurrences,
    vfChunkCount: vfChunks.length,
    vfChunkNodeCount: chunkNodes.size,
    chunkImageUrlOccurrences,
    chunkUniqueUrls: chunkBackedUrls.size,
    chunkBackedSourceOccurrences: occurrences.length,
    sourceImagesExcludedFromChunkPackets: Math.max(0, sourceImageOccurrences - occurrences.length),
    packetCount: packets.length,
    maxOccurrencesPerPacket: occurrencesByUrl.length ? Math.max(...occurrencesByUrl) : 0,
    occurrencesWithBeforeContext: occurrences.filter((item) => Boolean(item.context.beforeText)).length,
    occurrencesWithAfterContext: occurrences.filter((item) => Boolean(item.context.afterText)).length,
    occurrencesWithSameBlockImages: occurrences.filter((item) => item.relatedImages.sameBlockCount > 0).length,
    occurrencesWithNearbyImages: occurrences.filter((item) => item.relatedImages.nearby.length > 0).length,
    tableOccurrences: occurrences.filter((item) => item.context.flags.isTable).length,
    procedureOccurrences: occurrences.filter((item) => item.context.flags.isProcedure).length,
    warningOccurrences: occurrences.filter((item) => item.context.flags.isWarning).length,
    mappingIssueCount: mappingIssues.length,
    mappingIssues,
    note: 'No image bytes were fetched, no Vision API was called, and no database write was performed.',
  }

  return { occurrences, packets, report }
}

export async function readJsonLines(filePath) {
  const rows = []
  const lines = createInterface({
    input: createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })
  for await (const line of lines) {
    if (line.trim()) rows.push(JSON.parse(line))
  }
  return rows
}

export function toJsonLines(rows) {
  return rows.map((row) => JSON.stringify(row)).join('\n') + '\n'
}

export function buildVisualAnalysisReportMarkdown(report, paths) {
  return [
    '# VF visual analysis packets — local preparation report',
    '',
    '- Status: ' + report.status,
    '- VF documents: ' + report.vfDocumentCount.toLocaleString('vi-VN'),
    '- VF chunks: ' + report.vfChunkCount.toLocaleString('vi-VN'),
    '- Source image occurrences: ' + report.sourceImageOccurrences.toLocaleString('vi-VN'),
    '- Chunk image URL occurrences (includes overlap): ' + report.chunkImageUrlOccurrences.toLocaleString('vi-VN'),
    '- Chunk-backed source occurrences: ' + report.chunkBackedSourceOccurrences.toLocaleString('vi-VN'),
    '- Source images excluded because they are not present in current chunks: ' + report.sourceImagesExcludedFromChunkPackets.toLocaleString('vi-VN'),
    '- Unique analysis packets: ' + report.packetCount.toLocaleString('vi-VN'),
    '- Occurrences related to another image in the same block: ' + report.occurrencesWithSameBlockImages.toLocaleString('vi-VN'),
    '- Occurrences with nearby images in the same source node: ' + report.occurrencesWithNearbyImages.toLocaleString('vi-VN'),
    '- Table contexts: ' + report.tableOccurrences.toLocaleString('vi-VN'),
    '- Procedure contexts: ' + report.procedureOccurrences.toLocaleString('vi-VN'),
    '- Warning contexts: ' + report.warningOccurrences.toLocaleString('vi-VN'),
    '- Mapping issues: ' + report.mappingIssueCount.toLocaleString('vi-VN'),
    '',
    '## Artifacts',
    '',
    '- Packets ready for future Vision AI: ' + paths.packets,
    '- Full occurrence/context ledger: ' + paths.occurrences,
    '- Machine-readable report: ' + paths.report,
    '- Expected AI output schema: ' + paths.annotationSchema,
    '',
    '## Boundary',
    '',
    'The provisional asset key is derived from the source URL only. It is not a content hash and must be replaced or reconciled after SHA-256-bytes inventory.',
    '',
    'This preparation step does not fetch image bytes, call a Vision provider, approve annotations, write a database, or enable production retrieval.',
    '',
  ].join('\n')
}
