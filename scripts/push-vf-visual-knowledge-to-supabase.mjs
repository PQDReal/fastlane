import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'

import { createClient } from '@supabase/supabase-js'
import { planVisualAnnotationInserts } from './lib/vf-visual-db-push-plan.mjs'

function valueAfter(flag, fallback) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : fallback
}

async function readJsonLines(filePath) {
  const rows = []
  const lines = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })
  for await (const line of lines) {
    if (line.trim()) rows.push(JSON.parse(line))
  }
  return rows
}

function chunks(rows, size = 100) {
  const result = []
  for (let index = 0; index < rows.length; index += size) result.push(rows.slice(index, index + size))
  return result
}

async function fetchByValues(client, table, select, column, values) {
  const rows = []
  for (const batch of chunks([...new Set(values)])) {
    const { data, error } = await client.from(table).select(select).in(column, batch)
    if (error) throw new Error(`${table} lookup failed: ${error.message}`)
    rows.push(...(data || []))
  }
  return rows
}

async function upsertBatches(client, table, rows, onConflict) {
  for (const batch of chunks(rows)) {
    const { error } = await client.from(table).upsert(batch, { onConflict })
    if (error) throw new Error(`${table} upsert failed: ${error.message}`)
  }
}

async function insertBatches(client, table, rows) {
  for (const batch of chunks(rows)) {
    const { error } = await client.from(table).insert(batch)
    if (error) throw new Error(`${table} insert failed: ${error.message}`)
  }
}

const apply = process.argv.includes('--apply')
const seedDirectory = path.resolve(valueAfter(
  '--seed',
  '.local/knowledge-build/v2/visual-analysis/db-seed',
))
const paths = {
  assets: path.join(seedDirectory, 'assets.v1.jsonl'),
  occurrences: path.join(seedDirectory, 'occurrences.v1.jsonl'),
  annotations: path.join(seedDirectory, 'annotations.v1.jsonl'),
  report: path.join(seedDirectory, 'report.v1.json'),
}

try {
  for (const filePath of Object.values(paths)) {
    if (!fs.existsSync(filePath)) throw new Error(`Required visual seed artifact not found: ${filePath}`)
  }
  const [assets, occurrences, annotations] = await Promise.all([
    readJsonLines(paths.assets),
    readJsonLines(paths.occurrences),
    readJsonLines(paths.annotations),
  ])
  const report = JSON.parse(fs.readFileSync(paths.report, 'utf8'))
  if (report.status !== 'SEED_PLAN_READY_WITHIN_CAPACITY_ESTIMATE') {
    throw new Error(`Visual seed status is not applyable: ${report.status}`)
  }
  if (report.capacity?.estimatedInitialTotalMiB > report.capacityBudgetMiB) {
    throw new Error('Visual seed exceeds the configured database capacity budget')
  }
  if (assets.length !== 1_788 || occurrences.length !== 8_261 || annotations.length !== 1_788) {
    throw new Error('Visual seed count drift')
  }
  if (annotations.some((row) => row.status !== 'AI_DRAFT')) {
    throw new Error('Visual seed contains a non-draft annotation')
  }
  if (occurrences.some((row) => !row.versionContentChecksum)) {
    throw new Error('Visual occurrence is missing its exact version content checksum')
  }

  const plan = {
    status: apply ? 'VISUAL_DB_APPLY_REQUESTED' : 'VISUAL_DB_PUSH_PLAN_VALIDATED',
    assets: assets.length,
    occurrences: occurrences.length,
    annotations: annotations.length,
    approvedAnnotations: 0,
    embeddings: 0,
    estimatedInitialTotalMiB: report.capacity.estimatedInitialTotalMiB,
    capacityBudgetMiB: report.capacityBudgetMiB,
  }
  if (!apply) {
    process.stdout.write(`${JSON.stringify({
      ...plan,
      note: 'Validation only. No Supabase connection, storage upload, approval, embedding, or database write was performed.',
    }, null, 2)}\n`)
    process.exit(0)
  }

  if (process.env.KNOWLEDGE_VISUAL_DB_APPLY_APPROVED !== 'YES') {
    throw new Error('KNOWLEDGE_VISUAL_DB_APPLY_APPROVED=YES is required with --apply')
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  }
  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  await upsertBatches(client, 'sales_agent_knowledge_assets', assets.map((row) => ({
    sha256: row.sha256,
    mime_type: row.mimeType,
    byte_size: row.byteSize,
    width: row.width,
    height: row.height,
  })), 'sha256')
  const dbAssets = await fetchByValues(
    client,
    'sales_agent_knowledge_assets',
    'id,sha256',
    'sha256',
    assets.map((row) => row.sha256),
  )
  const assetIdByHash = new Map(dbAssets.map((row) => [row.sha256, row.id]))
  if (assetIdByHash.size !== assets.length) throw new Error('Not all canonical assets resolved after upsert')

  const documentKeys = [...new Set(occurrences.map((row) => row.documentKey))]
  const dbDocuments = await fetchByValues(
    client,
    'sales_agent_knowledge_documents',
    'id,document_key',
    'document_key',
    documentKeys,
  )
  const documentIdByKey = new Map(dbDocuments.map((row) => [row.document_key, row.id]))
  if (documentIdByKey.size !== documentKeys.length) {
    throw new Error('Task 019 documents must be imported before visual occurrences')
  }
  const dbVersions = await fetchByValues(
    client,
    'sales_agent_knowledge_versions',
    'id,document_id,content_checksum',
    'document_id',
    [...documentIdByKey.values()],
  )
  const versionIdByKeyAndChecksum = new Map(dbVersions.map((row) => [
    `${row.document_id}:${row.content_checksum}`,
    row.id,
  ]))

  const occurrenceUpserts = occurrences.map((row) => {
    const documentId = documentIdByKey.get(row.documentKey)
    const versionId = versionIdByKeyAndChecksum.get(`${documentId}:${row.versionContentChecksum}`)
    if (!versionId) {
      throw new Error(`Exact Task 019 version missing for ${row.documentKey}:${row.versionContentChecksum}`)
    }
    return {
      asset_id: assetIdByHash.get(row.assetSha256),
      version_id: versionId,
      source_occurrence_id: row.sourceOccurrenceId,
      source_packet_id: row.sourcePacketId,
      source_node_id: row.sourceNodeId,
      source_url: row.sourceUrl,
      source_locator: row.sourceLocator,
      ordinal: row.ordinal,
      role: row.role,
      context_text: row.contextText,
      relation_metadata: row.relationMetadata,
      retrieval_enabled: row.retrievalEnabled,
    }
  })
  await upsertBatches(
    client,
    'sales_agent_knowledge_asset_occurrences',
    occurrenceUpserts,
    'source_occurrence_id',
  )

  const existingAnnotations = await fetchByValues(
    client,
    'sales_agent_knowledge_asset_annotations',
    'id,asset_id,revision_no,content_hash',
    'asset_id',
    [...assetIdByHash.values()],
  )
  const {
    inserts: annotationInserts,
    reused: reusedAnnotations,
  } = planVisualAnnotationInserts({ annotations, assetIdByHash, existingAnnotations })
  await insertBatches(client, 'sales_agent_knowledge_asset_annotations', annotationInserts)

  process.stdout.write(`${JSON.stringify({
    ...plan,
    status: 'VISUAL_DB_APPLY_COMPLETE',
    upsertedAssets: assets.length,
    upsertedOccurrences: occurrenceUpserts.length,
    insertedAnnotations: annotationInserts.length,
    reusedAnnotations,
    note: 'All imported annotations remain AI_DRAFT. No storage upload, approval, embedding, or production activation was performed.',
  }, null, 2)}\n`)
} catch (error) {
  process.stderr.write(`Visual knowledge push failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
