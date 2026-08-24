import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { createClient } from '@supabase/supabase-js'
import { persistIndexedChunks } from '../lib/sales-agent/knowledge/indexing-pipeline.ts'
import {
  OPENAI_EMBEDDING_DIMENSIONS,
  OPENAI_EMBEDDING_GENERATION_ID,
  OPENAI_EMBEDDING_MODEL,
} from '../lib/sales-agent/knowledge/embedding-adapter.ts'

function valueAfter(flag, fallback) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : fallback
}

async function readJsonLines(filePath, onRow) {
  const lines = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })
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

function assertUuid(value, name) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '')) {
    throw new Error(`${name} must be a valid UUID`)
  }
}

function assertVector(vector, key) {
  if (!Array.isArray(vector) || vector.length !== OPENAI_EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding ${key} does not have ${OPENAI_EMBEDDING_DIMENSIONS} dimensions`)
  }
  if (vector.some((value) => !Number.isFinite(value))) throw new Error(`Embedding ${key} contains non-finite values`)
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  if (!Number.isFinite(magnitude) || magnitude <= 0.1) throw new Error(`Embedding ${key} is near zero`)
}

const apply = process.argv.includes('--apply')
const activate = process.argv.includes('--activate')
const forceReindex = process.argv.includes('--reindex') || process.argv.includes('--force')
const concurrency = Number(valueAfter('--concurrency', process.env.KNOWLEDGE_PUSH_CONCURRENCY || '6'))
const selectedDocumentKey = valueAfter('--document-key', null)
const buildDirectory = path.resolve(valueAfter('--build-dir', process.env.KNOWLEDGE_BUILD_DIR || '.local/knowledge-build/v2'))
const documentsPath = path.join(buildDirectory, 'documents.jsonl')
const chunksPath = path.join(buildDirectory, 'chunks.jsonl')
const embeddingsPath = path.join(buildDirectory, 'embeddings.jsonl')
const buildReportPath = path.join(buildDirectory, 'build-report.json')
const embeddingsReportPath = path.join(buildDirectory, 'embeddings-report.json')

try {
  for (const filePath of [documentsPath, chunksPath, embeddingsPath, buildReportPath, embeddingsReportPath]) {
    if (!fs.existsSync(filePath)) throw new Error(`Required build artifact not found: ${filePath}`)
  }
  if (activate && !apply) throw new Error('--activate requires --apply')
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) {
    throw new Error('--concurrency must be an integer between 1 and 16')
  }

  const buildReport = JSON.parse(fs.readFileSync(buildReportPath, 'utf8'))
  const embeddingsReport = JSON.parse(fs.readFileSync(embeddingsReportPath, 'utf8'))
  if (buildReport.status !== 'LOCAL_BUILD_VALIDATED_NOT_APPROVED_FOR_LIVE') {
    throw new Error(`Invalid build status: ${buildReport.status || 'missing'}`)
  }
  if (embeddingsReport.status !== 'EMBEDDINGS_COMPLETE_NOT_PUSHED') {
    throw new Error(`Invalid embeddings status: ${embeddingsReport.status || 'missing'}`)
  }
  if (embeddingsReport.buildPayloadHash !== buildReport.buildPayloadHash) {
    throw new Error('Embedding build hash does not match the prepared corpus')
  }
  if (embeddingsReport.model !== OPENAI_EMBEDDING_MODEL || embeddingsReport.indexGenerationId !== OPENAI_EMBEDDING_GENERATION_ID) {
    throw new Error('Embedding model/generation drift')
  }

  const documents = []
  await readJsonLines(documentsPath, (row) => documents.push(row))
  if (documents.length !== 31) throw new Error(`Expected 31 documents, got ${documents.length}`)
  const selectedDocuments = selectedDocumentKey
    ? documents.filter((document) => document.documentKey === selectedDocumentKey)
    : documents
  if (selectedDocumentKey && selectedDocuments.length !== 1) {
    throw new Error(`Unknown --document-key: ${selectedDocumentKey}`)
  }

  const chunksByDocument = new Map(documents.map((document) => [document.documentKey, []]))
  const requiredEmbeddingKeys = new Set()
  await readJsonLines(chunksPath, (row) => {
    const target = chunksByDocument.get(row.documentKey)
    if (!target) throw new Error(`Chunk references unknown document ${row.documentKey}`)
    if (row.indexGenerationId !== OPENAI_EMBEDDING_GENERATION_ID) throw new Error('Chunk generation drift')
    target.push(row)
    requiredEmbeddingKeys.add(row.embeddingCacheKey)
  })

  const embeddings = new Map()
  await readJsonLines(embeddingsPath, (row) => {
    if (row.model !== OPENAI_EMBEDDING_MODEL || row.indexGenerationId !== OPENAI_EMBEDDING_GENERATION_ID) {
      throw new Error('Embedding artifact model/generation drift')
    }
    assertVector(row.embedding, row.embeddingCacheKey)
    if (embeddings.has(row.embeddingCacheKey)) throw new Error(`Duplicate embedding ${row.embeddingCacheKey}`)
    embeddings.set(row.embeddingCacheKey, row.embedding)
  })
  const missingKeys = [...requiredEmbeddingKeys].filter((key) => !embeddings.has(key))
  if (missingKeys.length) throw new Error(`${missingKeys.length} required embeddings are missing`)

  const verification = {
    status: apply ? 'SUPABASE_APPLY_REQUESTED' : 'SUPABASE_PUSH_PLAN_VALIDATED',
    documents: documents.length,
    chunks: [...chunksByDocument.values()].reduce((sum, rows) => sum + rows.length, 0),
    uniqueEmbeddings: embeddings.size,
    buildPayloadHash: buildReport.buildPayloadHash,
    indexGenerationId: OPENAI_EMBEDDING_GENERATION_ID,
    activate,
    selectedDocumentKey,
  }

  if (!apply) {
    console.log(JSON.stringify({
      ...verification,
      note: 'Validation only. No Supabase connection or database write was performed.',
    }, null, 2))
  } else {
    if (process.env.KNOWLEDGE_SUPABASE_APPLY_APPROVED !== 'YES') {
      throw new Error('KNOWLEDGE_SUPABASE_APPLY_APPROVED=YES is required with --apply')
    }
    if (activate && process.env.KNOWLEDGE_SUPABASE_ACTIVATE_APPROVED !== 'YES') {
      throw new Error('KNOWLEDGE_SUPABASE_ACTIVATE_APPROVED=YES is required with --activate')
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
    const authorId = process.env.KNOWLEDGE_IMPORT_AUTHOR_ID
    const reviewerId = process.env.KNOWLEDGE_IMPORT_REVIEWER_ID
    assertUuid(authorId, 'KNOWLEDGE_IMPORT_AUTHOR_ID')
    assertUuid(reviewerId, 'KNOWLEDGE_IMPORT_REVIEWER_ID')
    if (authorId === reviewerId) throw new Error('Maker-checker violation: import author and reviewer must differ')

    const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    const applied = []
    let currentIndex = 0
    let completedCount = 0

    async function processDocument(document) {
      const docIndex = ++currentIndex
      const { data: existingDocument, error: findDocumentError } = await client
        .from('sales_agent_knowledge_documents')
        .select('*')
        .eq('document_key', document.documentKey)
        .eq('locale', document.locale)
        .maybeSingle()
      if (findDocumentError) throw new Error(`Document lookup failed for ${document.documentKey}: ${findDocumentError.message}`)

      let dbDocument = existingDocument
      if (!dbDocument) {
        const { data, error } = await client.from('sales_agent_knowledge_documents').insert({
          document_key: document.documentKey,
          slug: document.slug,
          title: document.title,
          category: document.category,
          status: 'DRAFT',
          published_version: 0,
          content_markdown: document.contentMarkdown,
          lifecycle_status: 'ACTIVE',
          locale: document.locale,
          market: document.market,
          vehicle_key: document.vehicleKey,
          vehicle_model: document.vehicleModel,
          model_year: document.modelYear,
          vehicle_type: document.vehicleType,
          customer_segment: document.customerSegment,
          source_kind: document.sourceKind,
          source_uri: document.sourceUri,
        }).select('*').single()
        if (error || !data) throw new Error(`Document insert failed for ${document.documentKey}: ${error?.message || 'no row'}`)
        dbDocument = data
      } else {
        const { error } = await client.from('sales_agent_knowledge_documents').update({
          title: document.title,
          category: document.category,
          market: document.market,
          vehicle_key: document.vehicleKey,
          vehicle_model: document.vehicleModel,
          model_year: document.modelYear,
          vehicle_type: document.vehicleType,
          customer_segment: document.customerSegment,
          source_kind: document.sourceKind,
          source_uri: document.sourceUri,
        }).eq('id', dbDocument.id)
        if (error) throw new Error(`Document metadata update failed for ${document.documentKey}: ${error.message}`)
      }

      const { data: versions, error: versionsError } = await client
        .from('sales_agent_knowledge_versions')
        .select('*')
        .eq('document_id', dbDocument.id)
        .order('version_no', { ascending: false })
      if (versionsError) throw new Error(`Version lookup failed for ${document.documentKey}: ${versionsError.message}`)

      let version = (versions || []).find((row) => row.content_checksum === document.sourceChecksum)
      if (forceReindex && version) {
        const { error: deleteChunksError } = await client
          .from('sales_agent_knowledge_chunks')
          .delete()
          .eq('version_id', version.id)
        if (deleteChunksError) throw new Error(`Chunk reset failed: ${deleteChunksError.message}`)
        const { error: resetVersionError } = await client.from('sales_agent_knowledge_versions').update({
          index_status: 'PENDING',
          publication_status: 'APPROVED',
        }).eq('id', version.id)
        if (resetVersionError) throw new Error(`Version reset failed: ${resetVersionError.message}`)
        version.index_status = 'PENDING'
        version.publication_status = 'APPROVED'
      }

      if (!version) {
        const versionNo = (versions?.[0]?.version_no || 0) + 1
        const { data, error } = await client.from('sales_agent_knowledge_versions').insert({
          document_id: dbDocument.id,
          version_no: versionNo,
          content_markdown: document.contentMarkdown,
          content_checksum: document.sourceChecksum,
          source_uri: document.sourceUri,
          source_checksum: document.sourceChecksum,
          source_retrieved_at: new Date().toISOString(),
          publication_status: 'APPROVED',
          index_status: 'PENDING',
          author_id: authorId,
          reviewer_id: reviewerId,
          approved_at: new Date().toISOString(),
        }).select('*').single()
        if (error || !data) throw new Error(`Version insert failed for ${document.documentKey}: ${error?.message || 'no row'}`)
        version = data
      }

      let jobId = null
      try {
        if (version.index_status !== 'READY') {
          if (version.publication_status !== 'APPROVED' || !version.reviewer_id) {
            throw new Error(`Existing matching version ${version.id} is not an approved import candidate`)
          }
          console.log(`[${docIndex}/${selectedDocuments.length}] Enqueueing & indexing ${document.documentKey} (${chunksByDocument.get(document.documentKey)?.length || 0} chunks)...`)
          const { data, error } = await client.rpc('sales_agent_enqueue_index_job', {
            p_version_id: version.id,
            p_index_generation_id: OPENAI_EMBEDDING_GENERATION_ID,
          })
          if (error || !data) throw new Error(`Index enqueue failed: ${error?.message || 'no job id'}`)
          jobId = data
          const { error: jobStartError } = await client.from('sales_agent_knowledge_index_jobs').update({
            status: 'PROCESSING', started_at: new Date().toISOString(), attempt_count: 1,
          }).eq('id', jobId)
          if (jobStartError) throw new Error(`Index job start failed: ${jobStartError.message}`)

          const preparedChunks = chunksByDocument.get(document.documentKey).map((chunk) => ({
            ...chunk,
            embedding: embeddings.get(chunk.embeddingCacheKey),
            versionId: version.id,
          }))
          const persisted = await persistIndexedChunks({
            client,
            documentId: dbDocument.id,
            versionId: version.id,
            versionNo: version.version_no,
            indexGenerationId: OPENAI_EMBEDDING_GENERATION_ID,
            chunks: preparedChunks,
          })
          const { error: jobCompleteError } = await client.from('sales_agent_knowledge_index_jobs').update({
            status: 'COMPLETED', completed_at: new Date().toISOString(),
            chunk_count: persisted.persistedChunkCount,
            embedded_count: preparedChunks.length,
            reused_count: 0,
          }).eq('id', jobId)
          if (jobCompleteError) throw new Error(`Index job completion failed: ${jobCompleteError.message}`)
          version = { ...version, index_status: 'READY' }
          completedCount++
          console.log(`[${completedCount}/${selectedDocuments.length}] Completed ${document.documentKey} (${persisted.persistedChunkCount} chunks, ${persisted.parentLinks} links)`)
        } else {
          completedCount++
          console.log(`[${completedCount}/${selectedDocuments.length}] Already READY: ${document.documentKey}`)
        }

        if (activate && (dbDocument.active_version_id !== version.id || version.publication_status !== 'PUBLISHED')) {
          if (version.publication_status !== 'APPROVED') {
            throw new Error(`Version ${version.id} is ${version.publication_status}, not APPROVED for activation`)
          }
          const { data, error } = await client.rpc('sales_agent_activate_version', {
            p_document_id: dbDocument.id,
            p_version_id: version.id,
            p_actor_id: reviewerId,
            p_reason: `VinFast manual corpus ${buildReport.buildPayloadHash}`,
          })
          if (error || data?.success !== true) throw new Error(`Activation failed: ${error?.message || 'invalid response'}`)
        }
        applied.push({ documentKey: document.documentKey, documentId: dbDocument.id, versionId: version.id, activated: activate })
      } catch (error) {
        if (jobId) {
          await client.from('sales_agent_knowledge_index_jobs').update({
            status: 'FAILED', completed_at: new Date().toISOString(),
            error_code: 'IMPORT_FAILED', error_message: error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000),
          }).eq('id', jobId)
        }
        throw error
      }
    }

    const queue = [...selectedDocuments]
    const workers = Array.from({ length: concurrency }, async () => {
      while (queue.length > 0) {
        const doc = queue.shift()
        if (doc) await processDocument(doc)
      }
    })
    await Promise.all(workers)

    console.log(JSON.stringify({ ...verification, status: 'SUPABASE_APPLY_COMPLETE', applied }, null, 2))
  }
} catch (error) {
  console.error(`Supabase knowledge push failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
