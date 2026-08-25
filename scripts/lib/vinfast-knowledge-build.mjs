import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  APPROVED_31_MANUAL_EDITIONS,
  VinFastManualMarkdownConnector,
  canonicalizeVehicleModel,
  parseEditionId,
} from '../../lib/sales-agent/knowledge/connector.ts'
import {
  CHUNK_HARD_MAX_TOKENS,
  buildHierarchicalChunks,
} from '../../lib/sales-agent/knowledge/hierarchical-chunker.ts'
import {
  buildEmbeddingCacheKey,
  buildEmbeddingInput,
} from '../../lib/sales-agent/knowledge/indexing-pipeline.ts'
import { OPENAI_EMBEDDING_GENERATION_ID } from '../../lib/sales-agent/knowledge/embedding-adapter.ts'

const ALLOWED_MANIFEST_STATUS = 'CODE_READY_NOT_APPROVED_FOR_LIVE'

function walkFiles(root, fileName) {
  const output = []
  const stack = [root]
  while (stack.length) {
    const current = stack.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name)
      if (entry.isDirectory()) stack.push(absolute)
      else if (entry.isFile() && entry.name === fileName) output.push(absolute)
    }
  }
  return output.sort()
}

export function parseFrontmatter(markdown) {
  const normalized = markdown.replace(/^\uFEFF/, '')
  if (!normalized.startsWith('---\n') && !normalized.startsWith('---\r\n')) {
    return { attributes: {}, body: normalized.trim() }
  }
  const match = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) throw new Error('Malformed Markdown frontmatter')

  const attributes = {}
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':')
    if (separator < 1) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    attributes[key] = value
  }

  const body = match[2]
    .replace(/^\s*\*Thuộc chương:[^\n]*\*\s*/im, '')
    .trim()
  return { attributes, body }
}

function normalizedBodyForEmptyCheck(body) {
  return body
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<!--[^]*?-->/g, '')
    .trim()
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function assertManifest(manifest) {
  if (manifest.status !== ALLOWED_MANIFEST_STATUS) {
    throw new Error(`Manifest status must be ${ALLOWED_MANIFEST_STATUS}; got ${manifest.status || 'missing'}`)
  }
  if (manifest.approvedAt !== null) throw new Error('Code-ready manifest must not claim live approval')
  const ids = manifest.selectedEditionIds
  if (!Array.isArray(ids) || ids.length !== 31 || new Set(ids).size !== 31) {
    throw new Error('Manifest must contain exactly 31 unique edition ids')
  }
  const expected = new Set(APPROVED_31_MANUAL_EDITIONS)
  if (ids.some((id) => !expected.has(id)) || expected.size !== ids.length) {
    throw new Error('Manifest selectedEditionIds drift from the code-ready 31-edition allowlist')
  }
}

function makeSlug(vehicleKey, modelYear) {
  return `so-tay-huong-dan-${vehicleKey}-${modelYear}`
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function assertInventory(actual, expected) {
  const keys = [
    'manualEditions',
    'totalNodes',
    'chapterNodes',
    'sectionNodes',
    'contentNodes',
    'emptyLeafNodes',
    'retainedImageOccurrences',
  ]
  for (const key of keys) {
    if (actual[key] !== expected[key]) {
      throw new Error(`MANIFEST_ASSERTION_FAILED: ${key} expected ${expected[key]}, got ${actual[key]}`)
    }
  }
}

export function loadVinFastKnowledgeCorpus({ sourceRoot, manifestPath }) {
  const absoluteRoot = path.resolve(sourceRoot)
  const absoluteManifest = path.resolve(manifestPath)
  if (!fs.existsSync(absoluteRoot)) throw new Error(`Manual source root not found: ${absoluteRoot}`)
  if (!fs.existsSync(absoluteManifest)) throw new Error(`Manifest not found: ${absoluteManifest}`)

  const manifest = readJson(absoluteManifest)
  assertManifest(manifest)
  const selected = new Set(manifest.selectedEditionIds)
  const byEdition = new Map()

  for (const structuredPath of walkFiles(path.join(absoluteRoot, 'models'), 'structured.json')) {
    const structured = readJson(structuredPath)
    const model = canonicalizeVehicleModel(String(structured.model || ''))
    const year = String(structured.version || '')
    const editionId = `${model}_${year}`
    if (!selected.has(editionId)) continue
    if (byEdition.has(editionId)) throw new Error(`Duplicate structured manual for ${editionId}`)
    byEdition.set(editionId, { structuredPath, structured })
  }

  const missing = manifest.selectedEditionIds.filter((id) => !byEdition.has(id))
  if (missing.length) throw new Error(`Missing selected structured manuals: ${missing.join(', ')}`)

  const connector = new VinFastManualMarkdownConnector()
  const documents = []
  const chunks = []
  const emptySections = []
  let chapterNodes = 0
  let sectionNodes = 0
  let retainedImageOccurrences = 0

  for (const editionId of manifest.selectedEditionIds) {
    const { structuredPath, structured } = byEdition.get(editionId)
    const manualRoot = path.dirname(structuredPath)
    const markdownSections = []
    let modelParam = ''
    chapterNodes += structured.chapters.length

    for (const chapter of structured.chapters) {
      for (const section of chapter.sections) {
        sectionNodes++
        retainedImageOccurrences += Array.isArray(section.images) ? section.images.length : 0
        const filePath = String(section.file_path || '').replace(/\\/g, '/')
        const absoluteSectionPath = path.resolve(manualRoot, filePath)
        if (!absoluteSectionPath.startsWith(`${path.resolve(manualRoot)}${path.sep}`)) {
          throw new Error(`Section path escapes manual root: ${filePath}`)
        }
        if (!fs.existsSync(absoluteSectionPath)) throw new Error(`Missing section Markdown: ${absoluteSectionPath}`)
        const parsed = parseFrontmatter(fs.readFileSync(absoluteSectionPath, 'utf8'))
        modelParam ||= String(parsed.attributes.model_param || '')
        if (!normalizedBodyForEmptyCheck(parsed.body)) {
          emptySections.push({ editionId, sectionId: String(section.section_id), filePath })
        }
        markdownSections.push({
          chapterTitle: String(parsed.attributes.chapter || chapter.name),
          sectionTitle: String(section.title || parsed.attributes.section || ''),
          sectionId: String(section.section_id || parsed.attributes.section_id || ''),
          filePath,
          contentMarkdown: parsed.body,
          images: Array.isArray(section.images) ? section.images : [],
        })
      }
    }

    const nonEmptySections = markdownSections.filter((section) => normalizedBodyForEmptyCheck(section.contentMarkdown))
    const docTree = connector.transformMarkdownSectionsToDocumentTree(editionId, nonEmptySections)
    const parsedEdition = parseEditionId(editionId)
    const sourceUri = modelParam
      ? `https://om.vinfastauto.com/vi_vn/detail?car=${encodeURIComponent(modelParam)}&year=${parsedEdition.modelYear}`
      : `manual://vinfast/${parsedEdition.vehicleKey}/${parsedEdition.modelYear}/vi-VN`
    const contentMarkdown = nonEmptySections
      .map((section) => `<!-- source_node_id:${section.sectionId}; path:${section.filePath} -->\n${section.contentMarkdown}`)
      .join('\n\n---\n\n')

    const document = {
      editionId,
      documentKey: parsedEdition.canonicalDocumentKey,
      slug: makeSlug(parsedEdition.vehicleKey, parsedEdition.modelYear),
      title: docTree.title,
      category: 'TECHNICAL_GUIDE',
      vehicleKey: parsedEdition.vehicleKey,
      vehicleModel: parsedEdition.vehicleModel,
      modelYear: parsedEdition.modelYear,
      vehicleType: 'CAR',
      market: 'VN',
      locale: 'vi-VN',
      customerSegment: 'ALL',
      sourceUri,
      sourceKind: 'VINFAST_OWNER_MANUAL',
      sourceChecksum: sha256(contentMarkdown),
      contentMarkdown,
      sectionCount: nonEmptySections.length,
    }
    documents.push(document)

    for (const chunk of buildHierarchicalChunks(docTree)) {
      const embeddingInput = buildEmbeddingInput(docTree, chunk)
      chunks.push({
        editionId,
        documentKey: document.documentKey,
        vehicleKey: document.vehicleKey,
        vehicleModel: document.vehicleModel,
        modelYear: document.modelYear,
        locale: document.locale,
        market: document.market,
        ...chunk,
        embeddingInput,
        embeddingCacheKey: buildEmbeddingCacheKey(OPENAI_EMBEDDING_GENERATION_ID, embeddingInput),
        indexGenerationId: OPENAI_EMBEDDING_GENERATION_ID,
      })
    }
  }

  const inventory = {
    manualEditions: documents.length,
    totalNodes: chapterNodes + sectionNodes,
    chapterNodes,
    sectionNodes,
    contentNodes: sectionNodes - emptySections.length,
    emptyLeafNodes: emptySections.length,
    retainedImageOccurrences,
  }
  assertInventory(inventory, manifest.expectedInventory)

  const maxChunkTokens = chunks.reduce((max, chunk) => Math.max(max, chunk.tokenCount), 0)
  const oversizedChunks = chunks.filter((chunk) => chunk.tokenCount > CHUNK_HARD_MAX_TOKENS)
  if (oversizedChunks.length) throw new Error(`${oversizedChunks.length} chunks exceed the hard token cap`)
  if (new Set(chunks.map((chunk) => `${chunk.documentKey}:${chunk.chunkIndex}`)).size !== chunks.length) {
    throw new Error('Duplicate document/chunk identity in build output')
  }

  // Gate kiểm tra toàn vẹn mapping hình ảnh, heading và bảng
  let totalPlaceholders = 0
  let unmappedPlaceholders = 0
  let phantomImages = 0
  let trailingHeadingChunks = 0
  let invalidTableChunks = 0

  for (const chunk of chunks) {
    // 1. Gate placeholder -> extractedImages
    const matches = [...chunk.content.matchAll(/\[img:\s*([^\]]+)\]/g)]
    for (const match of matches) {
      totalPlaceholders++
      const fileName = match[1].trim()
      const hasImage = Array.isArray(chunk.extractedImages) && chunk.extractedImages.some((img) => {
        const imgName = img.fileName || img.url.split('/').pop()?.split('#')[0]?.split('?')[0]
        return imgName === fileName || (img.id && img.id === fileName)
      })
      if (!hasImage) {
        unmappedPlaceholders++
      }
    }

    // 2. Gate ngược extractedImages -> placeholder
    if (Array.isArray(chunk.extractedImages)) {
      for (const img of chunk.extractedImages) {
        const imgName = img.fileName || img.url.split('/').pop()?.split('#')[0]?.split('?')[0]
        const hasPlaceholder = imgName ? chunk.content.includes(`[img: ${imgName}]`) : false
        const hasUrl = chunk.content.includes(img.url)
        const hasId = Boolean(img.id && chunk.content.includes(img.id))
        if (!hasPlaceholder && !hasUrl && !hasId) {
          phantomImages++
        }
      }
    }

    // 3. Gate kiểm tra heading mồ côi ở cuối chunk
    if (/(?:^|\n)#{1,6}\s+[^\n]+$/.test(chunk.content.trim())) {
      trailingHeadingChunks++
    }

    // 4. Gate kiểm tra tính toàn vẹn của bảng Markdown
    if (chunk.content.includes('| --- |') || chunk.content.includes('|:---|') || chunk.content.includes('| :--- |')) {
      const lines = chunk.content.split('\n').map((l) => l.trim()).filter(Boolean)
      const sepIdx = lines.findIndex((l) => /^\|(?:\s*[-:]+\s*\|)+/.test(l))
      if (sepIdx > 0) {
        const pipeLinesBeforeSep = lines.slice(0, sepIdx).filter((l) => l.startsWith('|'))
        if (pipeLinesBeforeSep.length > 1) {
          invalidTableChunks++
        }
      }
    }
  }

  if (unmappedPlaceholders > 0) {
    throw new Error(`Image mapping assertion failed: ${unmappedPlaceholders}/${totalPlaceholders} placeholders in chunks are missing extractedImages metadata!`)
  }
  if (phantomImages > 0) {
    throw new Error(`Phantom image metadata assertion failed: ${phantomImages} extractedImages do not appear in chunk content!`)
  }
  if (trailingHeadingChunks > 0) {
    throw new Error(`Orphan heading assertion failed: ${trailingHeadingChunks} chunks end with an orphan heading!`)
  }
  if (invalidTableChunks > 0) {
    throw new Error(`Table integrity assertion failed: ${invalidTableChunks} chunks have data rows placed before the table header!`)
  }

  const buildPayloadHash = sha256(JSON.stringify({
    manifestVersion: manifest.schemaVersion,
    documentChecksums: documents.map((document) => [document.documentKey, document.sourceChecksum]),
    chunkHashes: chunks.map((chunk) => [chunk.documentKey, chunk.chunkIndex, chunk.contentHash, chunk.embeddingCacheKey]),
  }))

  return {
    manifest,
    documents,
    chunks,
    report: {
      status: 'LOCAL_BUILD_VALIDATED_NOT_APPROVED_FOR_LIVE',
      manifestVersion: manifest.schemaVersion,
      indexGenerationId: OPENAI_EMBEDDING_GENERATION_ID,
      inventory,
      hierarchicalChunks: chunks.length,
      maxChunkTokens,
      uniqueEmbeddingInputs: new Set(chunks.map((chunk) => chunk.embeddingCacheKey)).size,
      emptySections,
      buildPayloadHash,
    },
  }
}

export function writeJsonLines(filePath, rows) {
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8')
}

export function writePreparedBuild(outputDirectory, build) {
  const absoluteOutput = path.resolve(outputDirectory)
  fs.mkdirSync(absoluteOutput, { recursive: true })
  writeJsonLines(path.join(absoluteOutput, 'documents.jsonl'), build.documents)
  writeJsonLines(path.join(absoluteOutput, 'chunks.jsonl'), build.chunks)
  fs.writeFileSync(
    path.join(absoluteOutput, 'corpus-catalog.v2.json'),
    `${JSON.stringify({
      status: build.report.status,
      manifestVersion: build.report.manifestVersion,
      inventory: build.report.inventory,
      editions: build.documents.map((document) => ({
        editionId: document.editionId,
        documentKey: document.documentKey,
        vehicleKey: document.vehicleKey,
        vehicleModel: document.vehicleModel,
        modelYear: document.modelYear,
        sourceUri: document.sourceUri,
        contentChecksum: document.contentChecksum,
      })),
    }, null, 2)}\n`,
    'utf8',
  )
  fs.writeFileSync(
    path.join(absoluteOutput, 'build-report.json'),
    `${JSON.stringify({ ...build.report, generatedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  )
  return absoluteOutput
}
