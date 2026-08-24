import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
  VinFastManualStagingConnector,
  APPROVED_29_MANUAL_EDITIONS,
} from '../lib/sales-agent/knowledge/connector.ts'
import { canonicalizeDocumentContent } from '../lib/sales-agent/knowledge/canonicalizer.ts'
import { buildHierarchicalChunks } from '../lib/sales-agent/knowledge/hierarchical-chunker.ts'

console.log('=== VinFast 29 Manual Real Ingestion & Strict Manifest Assertion (A19-KR-201, 202, 203) ===')

const manifestPath = path.resolve(
  process.env.MANUAL_CORPUS_MANIFEST_PATH || 'scripts/data/manual-corpus-allowlist.v1.json',
)
if (!fs.existsSync(manifestPath)) {
  console.error(`ERROR: Manifest file not found at ${manifestPath}`)
  process.exit(1)
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
const expected = manifest.expectedInventory

if (manifest.status !== 'APPROVED_GATE_BASELINE') {
  console.error(`ERROR: Manifest must be APPROVED_GATE_BASELINE, got '${manifest.status || 'missing'}'.`)
  process.exit(1)
}

if (!expected) {
  console.error('ERROR: Missing expectedInventory in manifest.')
  process.exit(1)
}

const selectedEditionIds = manifest.selectedEditionIds
const approvedEditionIds = new Set(APPROVED_29_MANUAL_EDITIONS)
const selectedEditionSet = new Set(Array.isArray(selectedEditionIds) ? selectedEditionIds : [])
if (
  !Array.isArray(selectedEditionIds)
  || selectedEditionIds.length !== approvedEditionIds.size
  || selectedEditionSet.size !== selectedEditionIds.length
  || selectedEditionIds.some((editionId) => !approvedEditionIds.has(editionId))
) {
  console.error('ERROR: Manifest selectedEditionIds must exactly match the approved 29-edition allowlist.')
  process.exit(1)
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
})
const connector = new VinFastManualStagingConnector()

async function runRealIngestion() {
  console.log(`Querying ${APPROVED_29_MANUAL_EDITIONS.length} manual editions from public.manual_articles...`)

  let totalRawNodes = 0
  let totalChapters = 0
  let totalSectionsWithContent = 0
  let totalEmptyLeafNodes = 0
  let totalExtractedImages = 0
  let totalGeneratedChunks = 0

  const editionReports = []

  for (const editionId of APPROVED_29_MANUAL_EDITIONS) {
    const { data: rawArticles, error } = await supabase
      .from('manual_articles')
      .select('id, original_id, model_id, parent_id, title, slug, level, sort_order, content_html, content_text')
      .eq('model_id', editionId)
      .order('sort_order', { ascending: true })

    if (error) {
      throw new Error(`Failed to fetch manual_articles for edition '${editionId}': ${error.message}`)
    }

    const rawNodes = (rawArticles || []).map((art) => ({
      id: art.id,
      originalId: String(art.original_id || art.id),
      modelId: art.model_id,
      title: art.title,
      slug: art.slug,
      level: art.level,
      parentId: art.parent_id,
      orderIndex: art.sort_order ?? 0,
      contentHtml: art.content_html || '',
      contentText: art.content_text || '',
    }))

    totalRawNodes += rawNodes.length

    const docTree = connector.transformStagingNodesToDocumentTree(editionId, rawNodes)
    const chunks = buildHierarchicalChunks(docTree)

    let editionImagesCount = 0
    let editionEmptyLeaves = 0
    let editionChapters = 0

    // Reconcile node types
    rawNodes.forEach((n) => {
      const content = (n.contentHtml || n.contentText || '').trim()
      if (n.level === 1 || !n.parentId) {
        editionChapters++
      } else if (!content || content.length < 5) {
        editionEmptyLeaves++
      }
    })

    // Count images across all sections
    docTree.sections.forEach((sec) => {
      const canonical = canonicalizeDocumentContent(sec.contentMarkdown)
      editionImagesCount += canonical.extractedImages.length
    })

    totalChapters += editionChapters
    totalSectionsWithContent += docTree.sections.length
    totalEmptyLeafNodes += editionEmptyLeaves
    totalExtractedImages += editionImagesCount
    totalGeneratedChunks += chunks.length

    editionReports.push({
      editionId,
      documentKey: docTree.documentKey,
      title: docTree.title,
      totalRawNodes: rawNodes.length,
      chaptersCount: editionChapters,
      contentSectionsCount: docTree.sections.length,
      emptyLeafCount: editionEmptyLeaves,
      extractedImagesCount: editionImagesCount,
      generatedChunksCount: chunks.length,
    })

    console.log(`[Reconciled] ${editionId}: ${rawNodes.length} nodes (${editionChapters} chap, ${docTree.sections.length} sec, ${editionEmptyLeaves} empty, ${editionImagesCount} imgs, ${chunks.length} chunks)`)
  }

  // Strict Fail-Closed Assertions against Manifest Expected Inventory
  console.log('\n=== Strict Manifest Assertions ===')
  if (APPROVED_29_MANUAL_EDITIONS.length !== expected.manualEditions) {
    throw new Error(`MANIFEST_ASSERTION_FAILED: Expected ${expected.manualEditions} editions, got ${APPROVED_29_MANUAL_EDITIONS.length}`)
  }
  if (totalRawNodes !== expected.totalNodes) {
    throw new Error(`MANIFEST_ASSERTION_FAILED: Expected ${expected.totalNodes} total nodes, got ${totalRawNodes}`)
  }
  if (totalChapters !== expected.chapterNodes) {
    throw new Error(`MANIFEST_ASSERTION_FAILED: Expected ${expected.chapterNodes} chapter nodes, got ${totalChapters}`)
  }
  if (totalSectionsWithContent !== expected.contentNodes) {
    throw new Error(`MANIFEST_ASSERTION_FAILED: Expected ${expected.contentNodes} content nodes, got ${totalSectionsWithContent}`)
  }
  if (totalEmptyLeafNodes !== expected.emptyLeafNodes) {
    throw new Error(`MANIFEST_ASSERTION_FAILED: Expected ${expected.emptyLeafNodes} empty leaf nodes, got ${totalEmptyLeafNodes}`)
  }
  if (totalExtractedImages !== expected.imageReferences) {
    throw new Error(`MANIFEST_ASSERTION_FAILED: Expected ${expected.imageReferences} image references, got ${totalExtractedImages}`)
  }
  console.log('✅ ALL 6 MANIFEST ASSERTIONS PASSED WITH 100% PRECISION.')

  const outReportPath = path.resolve(
    process.env.MANUAL_INGESTION_REPORT_PATH || '.local/tasks/sales-agent-knowledge-rag-upgrade-019/p2-ingestion-report.json',
  )
  const finalReport = {
    task: 'A19-KR-201, A19-KR-202, A19-KR-203',
    manifestVersion: manifest.schemaVersion,
    manifestStatus: manifest.status,
    generatedAt: new Date().toISOString(),
    status: 'INGESTION_INVENTORY_RECONCILED_AND_ASSERTED',
    sourceDatabase: 'public.manual_articles',
    allowlistEditionsCovered: APPROVED_29_MANUAL_EDITIONS.length,
    totalRawNodesProcessed: totalRawNodes,
    totalChaptersReconciled: totalChapters,
    totalSectionsWithContentReconciled: totalSectionsWithContent,
    totalEmptyLeafNodesReconciled: totalEmptyLeafNodes,
    totalImageReferencesInventory: totalExtractedImages,
    totalHierarchicalChunksProduced: totalGeneratedChunks,
    editionBreakdown: editionReports,
  }

  fs.mkdirSync(path.dirname(outReportPath), { recursive: true })
  fs.writeFileSync(outReportPath, JSON.stringify(finalReport, null, 2), 'utf-8')
  console.log('\n=== Reconciliation Summary ===')
  console.log(`- 29 Editions: 100% Processed`)
  console.log(`- Total Raw Nodes: ${totalRawNodes} == ${expected.totalNodes}`)
  console.log(`- Total Chapters: ${totalChapters} == ${expected.chapterNodes}`)
  console.log(`- Content Sections: ${totalSectionsWithContent} == ${expected.contentNodes}`)
  console.log(`- Empty Leaf Nodes: ${totalEmptyLeafNodes} == ${expected.emptyLeafNodes}`)
  console.log(`- Total Image Refs: ${totalExtractedImages} == ${expected.imageReferences}`)
  console.log(`- Total Hierarchical Chunks: ${totalGeneratedChunks}`)
  console.log(`Report saved to: ${outReportPath}`)
}

runRealIngestion().catch((err) => {
  console.error('Real Ingestion Assertion Failed:', err)
  process.exit(1)
})
