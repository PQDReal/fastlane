import fs from 'node:fs'
import path from 'node:path'

const entity = process.argv[2]
const chunkIndex = Number(process.argv[3] || 0)
const chunkSize = Number(process.argv[4] || 400)
const seedDirectory = path.resolve(
  process.argv[5] || '.local/knowledge-build/v2/visual-analysis/db-seed',
)
const dollarTag = '$vf_visual_seed$'

function readJsonLines(fileName) {
  return fs.readFileSync(path.join(seedDirectory, fileName), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

function payload(rows) {
  const json = JSON.stringify(rows)
  if (json.includes(dollarTag)) throw new Error('Seed payload collides with SQL dollar tag')
  return `${dollarTag}${json}${dollarTag}::jsonb`
}

function selected(rows) {
  const start = chunkIndex * chunkSize
  return rows.slice(start, start + chunkSize)
}

function assertChunk(rows) {
  if (!rows.length) throw new Error(`Empty ${entity} chunk ${chunkIndex}`)
}

if (entity === 'mapping') {
  const pairs = [...new Map(readJsonLines('occurrences.v1.jsonl').map((row) => [
    `${row.documentKey}:${row.versionContentChecksum}`,
    {
      document_key: row.documentKey,
      content_checksum: row.versionContentChecksum,
    },
  ])).values()]
  process.stdout.write(`
WITH input AS (
  SELECT *
  FROM jsonb_to_recordset(${payload(pairs)})
    AS row(document_key TEXT, content_checksum TEXT)
), resolved AS (
  SELECT input.*, version.id AS version_id
  FROM input
  JOIN public.sales_agent_knowledge_documents document
    ON document.document_key = input.document_key
  JOIN public.sales_agent_knowledge_versions version
    ON version.document_id = document.id
   AND version.content_checksum = input.content_checksum
)
SELECT
  (SELECT count(*) FROM input) AS input_count,
  (SELECT count(*) FROM resolved) AS resolved_count,
  (SELECT count(*) FROM input) - (SELECT count(*) FROM resolved) AS missing_count;
`)
} else if (entity === 'assets') {
  const rows = selected(readJsonLines('assets.v1.jsonl')).map((row) => ({
    sha256: row.sha256,
    mime_type: row.mimeType,
    byte_size: row.byteSize,
    width: row.width,
    height: row.height,
  }))
  assertChunk(rows)
  process.stdout.write(`
WITH input AS (
  SELECT *
  FROM jsonb_to_recordset(${payload(rows)})
    AS row(sha256 TEXT, mime_type TEXT, byte_size BIGINT, width INTEGER, height INTEGER)
), upserted AS (
  INSERT INTO public.sales_agent_knowledge_assets (
    sha256, mime_type, byte_size, width, height
  )
  SELECT sha256, mime_type, byte_size, width, height FROM input
  ON CONFLICT (sha256) DO UPDATE SET
    mime_type = EXCLUDED.mime_type,
    byte_size = EXCLUDED.byte_size,
    width = EXCLUDED.width,
    height = EXCLUDED.height,
    updated_at = timezone('utc', now())
  RETURNING 1
)
SELECT
  (SELECT count(*) FROM input) AS input_count,
  (SELECT count(*) FROM upserted) AS applied_count;
`)
} else if (entity === 'occurrences') {
  const rows = selected(readJsonLines('occurrences.v1.jsonl')).map((row) => ({
    asset_sha256: row.assetSha256,
    document_key: row.documentKey,
    version_content_checksum: row.versionContentChecksum,
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
  }))
  assertChunk(rows)
  process.stdout.write(`
WITH input AS (
  SELECT *
  FROM jsonb_to_recordset(${payload(rows)}) AS row(
    asset_sha256 TEXT,
    document_key TEXT,
    version_content_checksum TEXT,
    source_occurrence_id TEXT,
    source_packet_id TEXT,
    source_node_id TEXT,
    source_url TEXT,
    source_locator JSONB,
    ordinal INTEGER,
    role TEXT,
    context_text TEXT,
    relation_metadata JSONB,
    retrieval_enabled BOOLEAN
  )
), resolved AS (
  SELECT
    asset.id AS asset_id,
    version.id AS version_id,
    input.source_occurrence_id,
    input.source_packet_id,
    input.source_node_id,
    input.source_url,
    input.source_locator,
    input.ordinal,
    input.role,
    input.context_text,
    input.relation_metadata,
    input.retrieval_enabled
  FROM input
  JOIN public.sales_agent_knowledge_assets asset
    ON asset.sha256 = input.asset_sha256
  JOIN public.sales_agent_knowledge_documents document
    ON document.document_key = input.document_key
  JOIN LATERAL (
    SELECT candidate.id
    FROM public.sales_agent_knowledge_versions candidate
    WHERE candidate.document_id = document.id
      AND candidate.content_checksum = input.version_content_checksum
    ORDER BY candidate.created_at DESC, candidate.id
    LIMIT 1
  ) version ON true
), upserted AS (
  INSERT INTO public.sales_agent_knowledge_asset_occurrences (
    asset_id, version_id, source_occurrence_id, source_packet_id,
    source_node_id, source_url, source_locator, ordinal, role,
    context_text, relation_metadata, retrieval_enabled
  )
  SELECT
    asset_id, version_id, source_occurrence_id, source_packet_id,
    source_node_id, source_url, source_locator, ordinal, role,
    context_text, relation_metadata, retrieval_enabled
  FROM resolved
  ON CONFLICT (source_occurrence_id) DO UPDATE SET
    asset_id = EXCLUDED.asset_id,
    version_id = EXCLUDED.version_id,
    source_packet_id = EXCLUDED.source_packet_id,
    source_node_id = EXCLUDED.source_node_id,
    source_url = EXCLUDED.source_url,
    source_locator = EXCLUDED.source_locator,
    ordinal = EXCLUDED.ordinal,
    role = EXCLUDED.role,
    context_text = EXCLUDED.context_text,
    relation_metadata = EXCLUDED.relation_metadata,
    retrieval_enabled = EXCLUDED.retrieval_enabled,
    updated_at = timezone('utc', now())
  RETURNING 1
)
SELECT
  (SELECT count(*) FROM input) AS input_count,
  (SELECT count(*) FROM resolved) AS resolved_count,
  (SELECT count(*) FROM upserted) AS applied_count;
`)
} else if (entity === 'annotations') {
  const rows = selected(readJsonLines('annotations.v1.jsonl')).map((row) => ({
    asset_sha256: row.assetSha256,
    revision_no: row.revisionNo,
    status: row.status,
    decision: row.decision,
    image_type: row.imageType,
    title: row.title,
    summary: row.summary,
    keywords: row.keywords,
    visible_text: row.visibleText,
    relations: row.relations,
    confidence: row.confidence,
    retrieval_recommendation: row.retrievalRecommendation,
    safety_critical: row.safetyCritical,
    content_hash: row.contentHash,
    source_asset_sha256: row.sourceAssetSha256,
    source_packet_id: row.sourcePacketId,
    vision_provider: row.visionProvider,
    model_id: row.modelId,
    request_id: row.requestId,
    prompt_hash: row.promptHash,
    provenance: row.provenance,
  }))
  assertChunk(rows)
  process.stdout.write(`
WITH input AS (
  SELECT *
  FROM jsonb_to_recordset(${payload(rows)}) AS row(
    asset_sha256 TEXT,
    revision_no INTEGER,
    status TEXT,
    decision TEXT,
    image_type TEXT,
    title TEXT,
    summary TEXT,
    keywords JSONB,
    visible_text JSONB,
    relations JSONB,
    confidence REAL,
    retrieval_recommendation TEXT,
    safety_critical BOOLEAN,
    content_hash TEXT,
    source_asset_sha256 TEXT,
    source_packet_id TEXT,
    vision_provider TEXT,
    model_id TEXT,
    request_id TEXT,
    prompt_hash TEXT,
    provenance JSONB
  )
), resolved AS (
  SELECT asset.id AS asset_id, input.*
  FROM input
  JOIN public.sales_agent_knowledge_assets asset
    ON asset.sha256 = input.asset_sha256
), inserted AS (
  INSERT INTO public.sales_agent_knowledge_asset_annotations (
    asset_id, revision_no, status, decision, image_type, title, summary,
    keywords, visible_text, relations, confidence, retrieval_recommendation,
    safety_critical, content_hash, source_asset_sha256, source_packet_id,
    vision_provider, model_id, request_id, prompt_hash, provenance
  )
  SELECT
    resolved.asset_id,
    resolved.revision_no,
    'AI_DRAFT',
    resolved.decision,
    resolved.image_type,
    resolved.title,
    resolved.summary,
    ARRAY(SELECT jsonb_array_elements_text(resolved.keywords)),
    ARRAY(SELECT jsonb_array_elements_text(resolved.visible_text)),
    resolved.relations,
    resolved.confidence,
    resolved.retrieval_recommendation,
    resolved.safety_critical,
    resolved.content_hash,
    resolved.source_asset_sha256,
    resolved.source_packet_id,
    resolved.vision_provider,
    resolved.model_id,
    resolved.request_id,
    resolved.prompt_hash,
    resolved.provenance
  FROM resolved
  WHERE resolved.status = 'AI_DRAFT'
    AND NOT EXISTS (
      SELECT 1
      FROM public.sales_agent_knowledge_asset_annotations existing
      WHERE existing.asset_id = resolved.asset_id
        AND existing.content_hash = resolved.content_hash
    )
  ON CONFLICT (asset_id, revision_no) DO NOTHING
  RETURNING 1
)
SELECT
  (SELECT count(*) FROM input) AS input_count,
  (SELECT count(*) FROM resolved) AS resolved_count,
  (SELECT count(*) FROM inserted) AS inserted_count,
  (
    SELECT count(*)
    FROM resolved
    JOIN public.sales_agent_knowledge_asset_annotations existing
      ON existing.asset_id = resolved.asset_id
     AND existing.content_hash = resolved.content_hash
  ) AS present_count;
`)
} else {
  throw new Error('Usage: node generate-vf-visual-mcp-seed-sql.mjs <mapping|assets|occurrences|annotations> [chunkIndex] [chunkSize] [seedDirectory]')
}
