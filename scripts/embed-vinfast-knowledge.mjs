import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import {
  OPENAI_EMBEDDING_DIMENSIONS,
  OPENAI_EMBEDDING_GENERATION_ID,
  OPENAI_EMBEDDING_MODEL,
  OpenAIEmbeddingAdapter,
} from '../lib/sales-agent/knowledge/embedding-adapter.ts'
import { estimateTokenCount } from '../lib/sales-agent/knowledge/hierarchical-chunker.ts'

function valueAfter(flag, fallback) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : fallback
}

async function readJsonLines(filePath, onRow) {
  const input = fs.createReadStream(filePath, { encoding: 'utf8' })
  const lines = readline.createInterface({ input, crlfDelay: Infinity })
  let lineNumber = 0
  for await (const line of lines) {
    lineNumber++
    if (!line.trim()) continue
    try {
      await onRow(JSON.parse(line), lineNumber)
    } catch (error) {
      throw new Error(`${path.basename(filePath)}:${lineNumber}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

function validateCachedRow(row) {
  if (row.model !== OPENAI_EMBEDDING_MODEL) throw new Error(`Unexpected model ${row.model}`)
  if (row.indexGenerationId !== OPENAI_EMBEDDING_GENERATION_ID) throw new Error(`Unexpected generation ${row.indexGenerationId}`)
  if (!Array.isArray(row.embedding) || row.embedding.length !== OPENAI_EMBEDDING_DIMENSIONS) {
    throw new Error(`Invalid cached vector for ${row.embeddingCacheKey}`)
  }
  if (row.embedding.some((value) => !Number.isFinite(value))) throw new Error('Cached vector contains non-finite values')
  const magnitude = Math.sqrt(row.embedding.reduce((sum, value) => sum + value * value, 0))
  if (!Number.isFinite(magnitude) || magnitude <= 0.1) throw new Error('Cached vector is near zero')
}

const execute = process.argv.includes('--execute')
const buildDirectory = path.resolve(valueAfter('--build-dir', process.env.KNOWLEDGE_BUILD_DIR || '.local/knowledge-build/v2'))
const chunksPath = path.join(buildDirectory, 'chunks.jsonl')
const buildReportPath = path.join(buildDirectory, 'build-report.json')
const outputPath = path.resolve(valueAfter('--output', path.join(buildDirectory, 'embeddings.jsonl')))
const partialPath = `${outputPath}.partial`
const batchSize = Number(valueAfter('--batch-size', '256'))
const concurrency = Number(valueAfter('--concurrency', '4'))

try {
  if (!fs.existsSync(chunksPath) || !fs.existsSync(buildReportPath)) {
    throw new Error(`Prepared build not found at ${buildDirectory}; run prepare-vinfast-knowledge.mjs first`)
  }
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 512) {
    throw new Error('--batch-size must be an integer from 1 to 512')
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) {
    throw new Error('--concurrency must be an integer from 1 to 16')
  }

  const buildReport = JSON.parse(fs.readFileSync(buildReportPath, 'utf8'))
  if (buildReport.status !== 'LOCAL_BUILD_VALIDATED_NOT_APPROVED_FOR_LIVE') {
    throw new Error(`Prepared build status is not eligible: ${buildReport.status || 'missing'}`)
  }

  const uniqueInputs = new Map()
  let estimatedTokens = 0
  await readJsonLines(chunksPath, (row) => {
    if (row.indexGenerationId !== OPENAI_EMBEDDING_GENERATION_ID) {
      throw new Error(`Chunk generation drift: ${row.indexGenerationId}`)
    }
    if (!row.embeddingCacheKey || !row.embeddingInput) throw new Error('Chunk has no embedding input/cache key')
    if (!uniqueInputs.has(row.embeddingCacheKey)) {
      uniqueInputs.set(row.embeddingCacheKey, row.embeddingInput)
      estimatedTokens += estimateTokenCount(row.embeddingInput)
    }
  })

  const cachedKeys = new Set()
  const cacheSource = fs.existsSync(partialPath) ? partialPath : (fs.existsSync(outputPath) ? outputPath : null)
  if (cacheSource) {
    await readJsonLines(cacheSource, (row) => {
      validateCachedRow(row)
      if (cachedKeys.has(row.embeddingCacheKey)) throw new Error(`Duplicate cached key ${row.embeddingCacheKey}`)
      cachedKeys.add(row.embeddingCacheKey)
    })
  }

  const missing = [...uniqueInputs.entries()].filter(([key]) => !cachedKeys.has(key))
  const plan = {
    status: execute ? 'EMBED_EXECUTION_REQUESTED' : 'EMBED_PLAN_ONLY',
    model: OPENAI_EMBEDDING_MODEL,
    dimensions: OPENAI_EMBEDDING_DIMENSIONS,
    indexGenerationId: OPENAI_EMBEDDING_GENERATION_ID,
    buildPayloadHash: buildReport.buildPayloadHash,
    uniqueInputs: uniqueInputs.size,
    cachedEmbeddings: cachedKeys.size,
    missingEmbeddings: missing.length,
    estimatedInputTokens: estimatedTokens,
    estimatedCostUsdAtCurrentListPrice: Number(((estimatedTokens / 1_000_000) * 0.02).toFixed(6)),
  }

  if (!execute) {
    console.log(JSON.stringify({
      ...plan,
      note: 'Plan only. Pass --execute and set KNOWLEDGE_EMBED_APPROVED=YES to call OpenAI.',
    }, null, 2))
  } else {
    if (process.env.KNOWLEDGE_EMBED_APPROVED !== 'YES') {
      throw new Error('KNOWLEDGE_EMBED_APPROVED=YES is required with --execute')
    }
    if (!process.env.OPENAI_API_KEY?.trim()) throw new Error('OPENAI_API_KEY is required with --execute')

    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    if (!fs.existsSync(partialPath) && fs.existsSync(outputPath)) fs.copyFileSync(outputPath, partialPath)
    if (!fs.existsSync(partialPath)) fs.writeFileSync(partialPath, '', 'utf8')

    const adapter = new OpenAIEmbeddingAdapter({ maxBatchSize: batchSize })
    let totalTokensUsed = 0
    let completedCount = 0

    // Split missing into chunks of batchSize
    const batches = []
    for (let offset = 0; offset < missing.length; offset += batchSize) {
      batches.push(missing.slice(offset, offset + batchSize))
    }

    let batchIdx = 0
    async function worker() {
      while (batchIdx < batches.length) {
        const currentBatch = batches[batchIdx++]
        if (!currentBatch) break
        const response = await adapter.generateEmbeddings(currentBatch.map(([, input]) => input))
        totalTokensUsed += response.totalTokens
        const rows = currentBatch.map(([embeddingCacheKey], index) => ({
          embeddingCacheKey,
          indexGenerationId: OPENAI_EMBEDDING_GENERATION_ID,
          model: OPENAI_EMBEDDING_MODEL,
          dimensions: OPENAI_EMBEDDING_DIMENSIONS,
          embedding: response.embeddings[index].embedding,
        }))
        fs.appendFileSync(partialPath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8')
        completedCount += currentBatch.length
        console.log(`Embedded ${Math.min(completedCount, missing.length)}/${missing.length} missing inputs`)
      }
    }

    const workers = Array.from({ length: Math.min(concurrency, batches.length) }, () => worker())
    await Promise.all(workers)

    const completedKeys = new Set()
    await readJsonLines(partialPath, (row) => {
      validateCachedRow(row)
      if (completedKeys.has(row.embeddingCacheKey)) throw new Error(`Duplicate completed key ${row.embeddingCacheKey}`)
      completedKeys.add(row.embeddingCacheKey)
    })
    const unresolved = [...uniqueInputs.keys()].filter((key) => !completedKeys.has(key))
    if (unresolved.length) throw new Error(`Embedding output is incomplete: ${unresolved.length} unresolved inputs`)

    fs.copyFileSync(partialPath, outputPath)
    fs.unlinkSync(partialPath)
    const report = {
      ...plan,
      status: 'EMBEDDINGS_COMPLETE_NOT_PUSHED',
      cachedEmbeddings: completedKeys.size,
      missingEmbeddings: 0,
      apiTokensUsedThisRun: totalTokensUsed,
      generatedAt: new Date().toISOString(),
    }
    fs.writeFileSync(path.join(buildDirectory, 'embeddings-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(report, null, 2))
  }
} catch (error) {
  console.error(`Embedding build failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
