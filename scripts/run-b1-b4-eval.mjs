import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import {
  APPROVED_31_MANUAL_EDITIONS,
  parseEditionId,
} from '../lib/sales-agent/knowledge/connector.ts'
import { chunkMarkdownDocument } from '../lib/sales-agent/knowledge/chunker.ts'
import { PostgresFtsAdapter } from '../lib/sales-agent/knowledge/retrieval/fts-adapter.ts'
import { VectorCandidateAdapter } from '../lib/sales-agent/knowledge/retrieval/vector-adapter.ts'
import { fuseRrfCandidates } from '../lib/sales-agent/knowledge/retrieval/rrf-fusion.ts'
import { expandHierarchyCandidates } from '../lib/sales-agent/knowledge/retrieval/hierarchy-expansion.ts'
import { buildEvidenceContext } from '../lib/sales-agent/knowledge/retrieval/context-builder.ts'

// Run with: npx vite-node scripts/run-b1-b4-eval.mjs --allow-synthetic
console.log('=== B1/B2/B3/B4 Retrieval Evaluation Benchmark Runner (A19-KR-310) ===')

const cliArgs = new Set(process.argv.slice(2))
const allowSynthetic = cliArgs.has('--allow-synthetic')
// This is an in-memory comparison harness, not a live DB/API gate. Require an
// explicit opt-in so deterministic mock vectors cannot be reported as release
// evidence by accident.
if (!allowSynthetic) {
  console.error('Refusing to run as a production gate. Re-run with --allow-synthetic and treat the report as heuristic only.')
  process.exit(2)
}

const datasetPath = path.resolve('.local/tasks/sales-agent-knowledge-rag-upgrade-019/eval-dataset.v1.jsonl')
const jsonReportPath = path.resolve('.local/tasks/sales-agent-knowledge-rag-upgrade-019/b1-b4-paired-report.json')
const mdReportPath = path.resolve('.local/tasks/sales-agent-knowledge-rag-upgrade-019/b1-b4-paired-report.md')

if (!fs.existsSync(datasetPath)) {
  console.error(`Dataset not found at ${datasetPath}`)
  process.exit(1)
}

const rawContent = fs.readFileSync(datasetPath, 'utf-8')
const cases = rawContent
  .split('\n')
  .filter((l) => l.trim().length > 0)
  .map((l) => JSON.parse(l))

console.log(`Loaded ${cases.length} evaluation cases.`)

// 1. Load Seeded Policy Documents (Canonical policy docs)
const POLICY_DOCUMENTS = [
  {
    id: 'doc-warranty-battery',
    slug: 'chinh-sach-bao-hanh-xe-dien-vinfast',
    title: 'Chính sách bảo hành ô tô & pin xe điện VinFast',
    category: 'WARRANTY_BATTERY',
    documentKey: 'policy:warranty:v2',
    contentMarkdown: `# Chính Sách Bảo Hành Xe Điện VinFast\n\n## 1. Thời hạn bảo hành xe\n- Các dòng ô tô điện VinFast (VF 5, VF 6, VF 7, VF 8, VF 9, VF e34) được áp dụng chính sách bảo hành chính hãng **10 năm hoặc 200.000 km** (tùy điều kiện nào đến trước).\n- Dòng xe mini-SUV VinFast VF 3 được bảo hành chính hãng **7 năm hoặc 160.000 km**.\n- Các dòng xe máy điện (Evo 200, Feliz S, Klara S, Vento S, Theon S) được bảo hành **5 năm hoặc không giới hạn số km**.\n\n## 2. Chính sách bảo hành pin cao áp\n- Đối với khách hàng mua xe kèm pin: Pin cao áp được bảo hành **10 năm không giới hạn số km** cho các dòng ô tô VF 5, VF 6, VF 7, VF 8, VF 9; và **8 năm không giới hạn km** cho VF 3.\n- Đối với khách hàng thuê pin: VinFast cam kết bảo dưỡng, sửa chữa và thay mới pin miễn phí hoàn toàn khi dung lượng tiếp nhận sạc tối đa (SoH) giảm xuống dưới 70%.\n\n## 3. Dịch vụ cứu hộ & sạc lưu động\n- Dịch vụ cứu hộ 24/7 hoàn toàn miễn phí trong suốt thời gian bảo hành.\n- Hỗ trợ cứu hộ pin lưu động (Mobile Charging) và sửa chữa lưu động (Mobile Service) tại 63 tỉnh thành trên toàn quốc.`,
  },
  {
    id: 'doc-battery-charging-network',
    slug: 'chinh-sach-thue-pin-va-he-thong-tram-sac',
    title: 'Chính sách thuê pin & Hệ thống trạm sạc V-GREEN',
    category: 'WARRANTY_BATTERY',
    documentKey: 'policy:battery:v2',
    contentMarkdown: `# Chính Sách Thuê Pin & Mạng Lưới Trạm Sạc\n\n## 1. Các gói thuê pin ô tô điện\n- Gói di chuyển dưới 3.000 km/tháng: Mức phí thuê pin tiết kiệm phù hợp cho nhu cầu di chuyển gia đình và đô thị.\n- Gói di chuyển không giới hạn km: Mức phí cố định hàng tháng, không phát sinh chi phí phụ trội.\n- Thay pin miễn phí khi dung lượng SoH dưới 70%.\n\n## 2. Hệ thống trạm sạc V-GREEN\n- Mạng lưới trạm sạc phủ khắp 63 tỉnh thành, các tuyến cao tốc, quốc lộ, trung tâm thương mại. Chuẩn sạc CCS2 với sạc nhanh DC 30kW - 60kW và sạc siêu nhanh DC 150kW - 250kW (sạc 10-70% trong 15-25 phút).`,
  },
  {
    id: 'doc-deposit-delivery',
    slug: 'quy-trinh-dat-coc-va-nhan-xe-fastlane',
    title: 'Quy trình đặt cọc online & Bàn giao xe tại FASTLANE',
    category: 'DEPOSIT_DELIVERY',
    documentKey: 'policy:deposit:v2',
    contentMarkdown: `# Quy Trình Đặt Cọc & Nhận Xe FASTLANE\n\n## 1. Các bước đặt cọc xe trực tuyến\n- Bước 1: Chọn mẫu xe, phiên bản, màu ngoại thất và tùy chọn pin/phụ kiện trên hệ thống FASTLANE.\n- Bước 2: Nhập thông tin chủ xe (Họ tên, CCCD/CMND, Số điện thoại và Địa chỉ).\n- Bước 3: Xác thực mã OTP qua điện thoại để tạo hợp đồng đặt cọc điện tử.\n- Bước 4: Thanh toán tiền đặt cọc an toàn qua cổng thanh toán trực tuyến (VNPAY / Thẻ tín dụng).\n\n## 2. Số tiền đặt cọc quy định\n- VF 3: 15.000.000 VNĐ / xe.\n- VF 5, VF 6, VF 7: 30.000.000 VNĐ / xe.\n- VF 8, VF 9: 50.000.000 VNĐ / xe.\n- Xe máy điện: 2.000.000 VNĐ / xe.`,
  },
  {
    id: 'doc-financing-promotions',
    slug: 'chinh-sach-tra-gop-va-uu-dai-tai-chinh',
    title: 'Chính sách mua xe trả góp & Ưu đãi tài chính FASTLANE',
    category: 'PROMOTIONS_FINANCING',
    documentKey: 'policy:financing:v2',
    contentMarkdown: `# Chính Sách Mua Xe Trả Góp & Ưu Đãi Tài Chính\n\n## 1. Gói vay mua xe trả góp\n- Hỗ trợ hạn mức vay lên đến **80% giá trị xe**.\n- Thời hạn vay linh hoạt từ **1 năm đến 8 năm** (tối đa 96 tháng).\n- Lãi suất ưu đãi cố định 2 năm đầu tiên theo các chương trình hợp tác của VinFast và ngân hàng đối tác.\n- Duyệt hồ sơ online trong vòng 4 - 8 giờ làm việc.`,
  },
]

// 2. Build synthetic corpus: policy chunks + 31 selected manual editions.
const fullCorpusChunks = []

// Add policy chunks
POLICY_DOCUMENTS.forEach((doc) => {
  const rawChunks = chunkMarkdownDocument(doc.contentMarkdown, doc.title)
  rawChunks.forEach((c) => {
    fullCorpusChunks.push({
      chunkId: `chunk-${doc.id}-${c.chunkIndex}`,
      documentId: doc.id,
      documentKey: doc.documentKey,
      versionId: `ver-${doc.id}-v1`,
      versionNo: 1,
      indexGenerationId: 'openai-text-embedding-3-small-512-v1',
      chunkLevel: 2,
      hierarchyPath: `policy/${doc.slug}/${c.chunkIndex}`,
      sectionAnchor: `section_${c.chunkIndex}`,
      sectionTitle: c.sectionTitle,
      content: c.content,
      contentHash: `hash-${doc.id}-${c.chunkIndex}`,
      tokenCount: Math.ceil(c.content.length / 4),
      tags: c.tags,
      title: doc.title,
      slug: doc.slug,
      category: doc.category,
      effectiveFrom: '2025-01-01T00:00:00Z',
      effectiveTo: null,
      publicationStatus: 'PUBLISHED',
      indexStatus: 'READY',
      embedding: new Array(512).fill(0.015),
    })
  })
})

// Add 29 Manual Editions from local structured chunks
const chunksJsonlPath = path.resolve('.local/vinfast_manuals/rag_chunks/vinfast_chunks_all.jsonl')
let loadedManualsCount = 0

if (fs.existsSync(chunksJsonlPath)) {
  const content = fs.readFileSync(chunksJsonlPath, 'utf-8')
  const lines = content.split('\n').filter((l) => l.trim().length > 0)
  const approvedSet = new Set(APPROVED_31_MANUAL_EDITIONS)
  const countedEditions = new Set()

  lines.forEach((line) => {
    const item = JSON.parse(line)
    let model = item.model.trim()
    if (model === 'VF7') model = 'VF 7'
    if (model === 'VF8') model = 'VF 8'
    if (model === 'VF9') model = 'VF 9'
    if (model === 'VF6') model = 'VF 6'
    if (model === 'VF5') model = 'VF 5'
    if (model === 'VF3') model = 'VF 3'
    if (model === 'VFe34') model = 'VF e34'

    const edId = `${model}_${item.year}`
    if (approvedSet.has(edId)) {
      countedEditions.add(edId)
      const { vehicleModel, modelYear, canonicalDocumentKey } = parseEditionId(edId)
      fullCorpusChunks.push({
        chunkId: `chunk-${item.id}`,
        documentId: `doc-${edId}`,
        documentKey: canonicalDocumentKey,
        versionId: `ver-${edId}-v1`,
        versionNo: 1,
        indexGenerationId: 'openai-text-embedding-3-small-512-v1',
        chunkLevel: 2,
        hierarchyPath: `${item.chapter_index}_${item.chapter}/${item.section_index}_${item.section}`,
        sectionAnchor: item.anchors?.[0] || item.section,
        sectionTitle: `${item.chapter} — ${item.section}`,
        content: item.content || '',
        contentHash: `hash-${item.id}`,
        tokenCount: Math.ceil((item.content || '').length / 4),
        tags: [vehicleModel, String(modelYear), item.chapter, item.section, ...(item.anchors || [])],
        sourceNodeId: item.id,
        imageRefs: item.image_urls || [],
        title: `Sổ tay hướng dẫn sử dụng VinFast ${vehicleModel} (${modelYear})`,
        slug: `manual-${edId.toLowerCase().replace(/\s+/g, '-')}`,
        category: 'TECHNICAL_GUIDE',
        effectiveFrom: '2025-01-01T00:00:00Z',
        effectiveTo: null,
        publicationStatus: 'PUBLISHED',
        indexStatus: 'READY',
        embedding: new Array(512).fill(0.012),
      })
    }
  })
  loadedManualsCount = countedEditions.size
}

if (loadedManualsCount !== APPROVED_31_MANUAL_EDITIONS.length) {
  throw new Error(
    `Synthetic benchmark corpus is incomplete: expected ${APPROVED_31_MANUAL_EDITIONS.length} editions, got ${loadedManualsCount}`,
  )
}

console.log(`Corpus loaded with ${fullCorpusChunks.length} chunks across ${loadedManualsCount} manual editions and ${POLICY_DOCUMENTS.length} policy documents.`)

// 3. Evaluator for a Variant
const ftsAdapter = new PostgresFtsAdapter()
const syntheticEmbeddingProvider = {
  async generateEmbeddings(texts) {
    return {
      embeddings: texts.map((_, index) => ({ index, embedding: new Array(512).fill(0.015) })),
      totalTokens: texts.length,
      model: 'synthetic-test-only',
      dimensions: 512,
    }
  },
}
const vecAdapter = new VectorCandidateAdapter(
  undefined,
  undefined,
  'openai-text-embedding-3-small-512-v1',
  syntheticEmbeddingProvider,
)

async function evaluateVariant(variantName, retrieveFn) {
  const caseResults = []
  const latencies = []

  for (const evalCase of cases) {
    const start = performance.now()
    const retrievedItems = await retrieveFn(evalCase)
    const durationMs = performance.now() - start
    latencies.push(durationMs)

    const expectedCitations = evalCase.gold.expectedCitations || []
    const requiredCitations = expectedCitations.filter((c) => c.relevance === 3)
    const allRelevantCitations = expectedCitations.filter((c) => c.relevance >= 1)

    let firstRelevantRank = null
    let firstRequiredRank = null
    let hitAt1 = false
    let hitAt2 = false
    let hitAt4 = false
    let retrievedRequiredCount = 0
    let wrongModelError = false

    const filterModel = evalCase.filters?.vehicleModel?.toLowerCase().replace(/\s+/g, '')

    retrievedItems.slice(0, 4).forEach((item, index) => {
      const rank = index + 1
      const isRelevant = allRelevantCitations.some(
        (c) =>
          c.documentKey === item.documentKey ||
          item.title?.toLowerCase().includes(c.documentKey.split(':')[1]?.toLowerCase() || '___') ||
          item.documentKey?.includes(c.documentKey)
      )

      const isRequired = requiredCitations.some(
        (c) =>
          c.documentKey === item.documentKey ||
          item.title?.toLowerCase().includes(c.documentKey.split(':')[1]?.toLowerCase() || '___') ||
          item.documentKey?.includes(c.documentKey)
      )

      if (isRelevant && firstRelevantRank === null) {
        firstRelevantRank = rank
      }
      if (isRequired && firstRequiredRank === null) {
        firstRequiredRank = rank
      }
      if (isRelevant) {
        if (rank === 1) hitAt1 = true
        if (rank <= 2) hitAt2 = true
        if (rank <= 4) hitAt4 = true
      }
      if (isRequired) {
        retrievedRequiredCount++
      }

      // Check wrong model error
      if (filterModel) {
        const itemText = `${item.title} ${item.hierarchyPath || ''} ${item.documentKey}`.toLowerCase().replace(/\s+/g, '')
        if (!itemText.includes(filterModel) && !item.documentKey.includes('policy')) {
          wrongModelError = true
        }
      }
    })

    const totalRequired = requiredCitations.length > 0 ? requiredCitations.length : 1
    const recallAt4 = Math.min(1.0, retrievedRequiredCount / totalRequired)
    const mrrAt4 = firstRelevantRank !== null ? 1.0 / firstRelevantRank : 0

    // Compute nDCG@4
    let dcg = 0
    let idcg = 0
    retrievedItems.slice(0, 4).forEach((item, idx) => {
      const rank = idx + 1
      const matchedCitation = expectedCitations.find(
        (c) => c.documentKey === item.documentKey || item.title?.includes(c.documentKey.split(':')[1] || '___')
      )
      const rel = matchedCitation ? matchedCitation.relevance : 0
      dcg += (Math.pow(2, rel) - 1) / (Math.log2(rank + 1))
    })

    const sortedGolds = [...expectedCitations].sort((a, b) => b.relevance - a.relevance).slice(0, 4)
    sortedGolds.forEach((g, idx) => {
      idcg += (Math.pow(2, g.relevance) - 1) / (Math.log2(idx + 2))
    })
    const ndcgAt4 = idcg > 0 ? dcg / idcg : (firstRelevantRank !== null ? 1.0 : 0.0)

    caseResults.push({
      id: evalCase.id,
      intent: evalCase.intent,
      split: evalCase.split || 'dev',
      hitAt1,
      hitAt2,
      hitAt4,
      recallAt4,
      mrrAt4,
      ndcgAt4,
      wrongModelError,
    })
  }

  // Summary calculations
  const total = cases.length
  const hit1Rate = caseResults.filter((r) => r.hitAt1).length / total
  const hit2Rate = caseResults.filter((r) => r.hitAt2).length / total
  const hit4Rate = caseResults.filter((r) => r.hitAt4).length / total
  const avgRecall4 = caseResults.reduce((acc, r) => acc + r.recallAt4, 0) / total
  const avgMrr4 = caseResults.reduce((acc, r) => acc + r.mrrAt4, 0) / total
  const avgNdcg4 = caseResults.reduce((acc, r) => acc + r.ndcgAt4, 0) / total
  const wrongModelRate = caseResults.filter((r) => r.wrongModelError).length / total

  latencies.sort((a, b) => a - b)
  const meanLatency = latencies.reduce((acc, v) => acc + v, 0) / latencies.length
  const p50Latency = latencies[Math.floor(latencies.length * 0.5)] || 0
  const p95Latency = latencies[Math.floor(latencies.length * 0.95)] || 0
  const maxLatency = latencies[latencies.length - 1] || 0

  // Category breakdown
  const categoryStats = {}
  const intents = Array.from(new Set(cases.map((c) => c.intent)))
  for (const intent of intents) {
    const subset = caseResults.filter((r) => r.intent === intent)
    categoryStats[intent] = {
      count: subset.length,
      hitAt4: subset.filter((r) => r.hitAt4).length / (subset.length || 1),
      mrrAt4: subset.reduce((acc, r) => acc + r.mrrAt4, 0) / (subset.length || 1),
    }
  }

  return {
    variant: variantName,
    overall: {
      hitAt1: Math.round(hit1Rate * 1000) / 10,
      hitAt2: Math.round(hit2Rate * 1000) / 10,
      hitAt4: Math.round(hit4Rate * 1000) / 10,
      recallAt4: Math.round(avgRecall4 * 1000) / 1000,
      mrrAt4: Math.round(avgMrr4 * 1000) / 1000,
      ndcgAt4: Math.round(avgNdcg4 * 1000) / 1000,
      wrongModelRate: Math.round(wrongModelRate * 1000) / 10,
    },
    latency: {
      meanMs: Math.round(meanLatency * 100) / 100,
      p50Ms: Math.round(p50Latency * 100) / 100,
      p95Ms: Math.round(p95Latency * 100) / 100,
      maxMs: Math.round(maxLatency * 100) / 100,
    },
    categoryStats,
  }
}

// Execute Evaluation for B0..B4
async function runAllBenchmarks() {
  console.log('Running B0 Baseline (AS-IS Keyword on 4 legacy docs)...')
  const b0Report = await evaluateVariant('B0_Baseline', (evalCase) => {
    const cleanQuery = (evalCase.query || '').toLowerCase().trim()
    const tokens = cleanQuery.split(/\s+/).filter((t) => t.length >= 2)
    const scored = []

    fullCorpusChunks.slice(0, 11).forEach((chunk) => {
      let score = 0
      const contentLower = chunk.content.toLowerCase()
      const titleLower = chunk.sectionTitle.toLowerCase()
      if (contentLower.includes(cleanQuery)) score += 10
      tokens.forEach((t) => {
        if (titleLower.includes(t)) score += 5
        if (contentLower.includes(t)) score += 2
      })
      if (score > 0) scored.push({ ...chunk, score })
    })
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, 4)
  })

  console.log('Running B1 (Postgres FTS Lexical on Full 29 Manuals)...')
  const b1Report = await evaluateVariant('B1_FTS_Lexical', async (evalCase) => {
    const ftsHits = await ftsAdapter.searchCandidates(
      evalCase.query,
      evalCase.filters || {},
      { ftsCandidateLimit: 4 },
      fullCorpusChunks
    )
    return ftsHits
  })

  console.log('Running B2 (Vector Semantic Search)...')
  const b2Report = await evaluateVariant('B2_Vector_Semantic', async (evalCase) => {
    const vecHits = await vecAdapter.searchCandidates(
      evalCase.query,
      evalCase.filters || {},
      { vectorCandidateLimit: 4 },
      fullCorpusChunks
    )
    return vecHits
  })

  console.log('Running B3 (Hybrid RRF Fusion k=60)...')
  const b3Report = await evaluateVariant('B3_Hybrid_RRF', async (evalCase) => {
    const ftsHits = await ftsAdapter.searchCandidates(
      evalCase.query,
      evalCase.filters || {},
      { ftsCandidateLimit: 10 },
      fullCorpusChunks
    )
    const vecHits = await vecAdapter.searchCandidates(
      evalCase.query,
      evalCase.filters || {},
      { vectorCandidateLimit: 10 },
      fullCorpusChunks
    )
    return fuseRrfCandidates(ftsHits, vecHits, { k: 60, limit: 4 })
  })

  console.log('Running B4 (Hybrid Hierarchical Expansion + Dedupe)...')
  const b4Report = await evaluateVariant('B4_Hybrid_Hierarchical', async (evalCase) => {
    const ftsHits = await ftsAdapter.searchCandidates(
      evalCase.query,
      evalCase.filters || {},
      { ftsCandidateLimit: 12 },
      fullCorpusChunks
    )
    const vecHits = await vecAdapter.searchCandidates(
      evalCase.query,
      evalCase.filters || {},
      { vectorCandidateLimit: 12 },
      fullCorpusChunks
    )
    const fused = fuseRrfCandidates(ftsHits, vecHits, { k: 60, limit: 10 })
    const expanded = expandHierarchyCandidates(fused, fullCorpusChunks, {
      enableParentExpansion: true,
      enableNeighborExpansion: true,
    })
    const { items } = buildEvidenceContext(expanded, { topK: 4, tokenBudget: 2500 })
    return items
  })

  const fullReport = {
    timestamp: new Date().toISOString(),
    benchmarkMode: 'SYNTHETIC_IN_MEMORY_ONLY',
    releaseGate: 'NOT_EVALUATED',
    embeddingMode: 'DETERMINISTIC_MOCK_VECTORS',
    corpusRepresentation: 'RAW_STAGING_SECTION_CHUNKS_FLAT_HIERARCHY',
    totalEvalCases: cases.length,
    variants: {
      B0: b0Report,
      B1: b1Report,
      B2: b2Report,
      B3: b3Report,
      B4: b4Report,
    },
  }

  // Write JSON report
  fs.writeFileSync(jsonReportPath, JSON.stringify(fullReport, null, 2), 'utf-8')

  // Generate Markdown comparison table report
  const mdContent = `# B1/B2/B3/B4 Retrieval Evaluation Paired Report (A19-KR-310)

**Timestamp:** ${fullReport.timestamp}  
**Total Evaluation Cases:** ${cases.length} (70 dev / 30 hidden / 20 regression)  
**Corpus Chunks:** ${fullCorpusChunks.length} chunks (${loadedManualsCount} manual editions, ${POLICY_DOCUMENTS.length} policy documents)  
**Benchmark mode:** SYNTHETIC_IN_MEMORY_ONLY — deterministic mock vectors and flat staging chunks; this is not a live DB/API release gate.
**Embedding mode:** DETERMINISTIC_MOCK_VECTORS (explicit --allow-synthetic)
**Corpus representation:** raw staging section chunks; persisted P2 hierarchical chunks are not validated by this script.

---

## 1. Bảng So sánh Tổng thể các Biến thể (Overall Comparison Matrix)

| Metric | B0 (AS-IS Baseline) | B1 (FTS Lexical) | B2 (Vector Semantic) | B3 (Hybrid RRF) | B4 (Hybrid Hierarchical) | B4 vs B0 Gain |
|---|---:|---:|---:|---:|---:|---:|
| **Hit@1 (%)** | ${b0Report.overall.hitAt1}% | ${b1Report.overall.hitAt1}% | ${b2Report.overall.hitAt1}% | ${b3Report.overall.hitAt1}% | **${b4Report.overall.hitAt1}%** | +${Math.round((b4Report.overall.hitAt1 - b0Report.overall.hitAt1) * 10) / 10}% |
| **Hit@2 (%)** | ${b0Report.overall.hitAt2}% | ${b1Report.overall.hitAt2}% | ${b2Report.overall.hitAt2}% | ${b3Report.overall.hitAt2}% | **${b4Report.overall.hitAt2}%** | +${Math.round((b4Report.overall.hitAt2 - b0Report.overall.hitAt2) * 10) / 10}% |
| **Hit@4 (%)** | ${b0Report.overall.hitAt4}% | ${b1Report.overall.hitAt4}% | ${b2Report.overall.hitAt4}% | ${b3Report.overall.hitAt4}% | **${b4Report.overall.hitAt4}%** | +${Math.round((b4Report.overall.hitAt4 - b0Report.overall.hitAt4) * 10) / 10}% |
| **Recall@4** | ${b0Report.overall.recallAt4} | ${b1Report.overall.recallAt4} | ${b2Report.overall.recallAt4} | ${b3Report.overall.recallAt4} | **${b4Report.overall.recallAt4}** | +${Math.round((b4Report.overall.recallAt4 - b0Report.overall.recallAt4) * 1000) / 1000} |
| **MRR@4** | ${b0Report.overall.mrrAt4} | ${b1Report.overall.mrrAt4} | ${b2Report.overall.mrrAt4} | ${b3Report.overall.mrrAt4} | **${b4Report.overall.mrrAt4}** | +${Math.round((b4Report.overall.mrrAt4 - b0Report.overall.mrrAt4) * 1000) / 1000} |
| **nDCG@4** | ${b0Report.overall.ndcgAt4} | ${b1Report.overall.ndcgAt4} | ${b2Report.overall.ndcgAt4} | ${b3Report.overall.ndcgAt4} | **${b4Report.overall.ndcgAt4}** | +${Math.round((b4Report.overall.ndcgAt4 - b0Report.overall.ndcgAt4) * 1000) / 1000} |
| **Wrong Model Rate (%)** | ${b0Report.overall.wrongModelRate}% | ${b1Report.overall.wrongModelRate}% | ${b2Report.overall.wrongModelRate}% | ${b3Report.overall.wrongModelRate}% | **${b4Report.overall.wrongModelRate}%** | -${Math.round((b0Report.overall.wrongModelRate - b4Report.overall.wrongModelRate) * 10) / 10}% |
| **Latency p50 (ms)** | ${b0Report.latency.p50Ms} ms | ${b1Report.latency.p50Ms} ms | ${b2Report.latency.p50Ms} ms | ${b3Report.latency.p50Ms} ms | **${b4Report.latency.p50Ms} ms** | — |
| **Latency p95 (ms)** | ${b0Report.latency.p95Ms} ms | ${b1Report.latency.p95Ms} ms | ${b2Report.latency.p95Ms} ms | ${b3Report.latency.p95Ms} ms | **${b4Report.latency.p95Ms} ms** | — |

---

## 2. Phân Tích Chi Tiết theo 8 Nhóm Ý Định (Intent Breakdown on B4)

| Intent Category | Total Cases | B4 Hit@4 (%) | B4 MRR@4 | Nhận xét chất lượng |
|---|---:|---:|---:|---|
${Object.entries(b4Report.categoryStats)
  .map(
    ([intent, stat]) =>
      `| \`${intent}\` | ${stat.count} | ${Math.round(stat.hitAt4 * 1000) / 10}% | ${Math.round(stat.mrrAt4 * 1000) / 1000} | ${stat.hitAt4 >= 0.8 ? 'Đạt Target Gate' : 'Cần theo dõi'} |`
  )
  .join('\n')}

---

## 3. Kết luận và Khuyến nghị Release Gate B4

1. **Kết quả quan sát được (không phải claim release)**: B4 đạt Hit@4 **${b4Report.overall.hitAt4}%**, so với B0 ${b0Report.overall.hitAt4}% và B3 ${b3Report.overall.hitAt4}%. Chỉ số này không được diễn giải là cải thiện nếu B4 thấp hơn biến thể trước đó.
2. **Kiểm tra sai lệch dòng xe**: Wrong-model rate của B4 là **${b4Report.overall.wrongModelRate}%** trong corpus tổng hợp; cần chạy lại trên RPC/live DB trước khi phê duyệt.
3. **SLO**: p50 **${b4Report.latency.p50Ms} ms**, p95 **${b4Report.latency.p95Ms} ms**; trạng thái gate là **NOT_EVALUATED** vì runner không đo đường production và không tự xác nhận ngưỡng p95 $\le 180$ms.
`

  fs.writeFileSync(mdReportPath, mdContent, 'utf-8')

  console.log(`\n=== B1..B4 EVALUATION COMPLETE ===`)
  console.log(`JSON Report: ${jsonReportPath}`)
  console.log(`Markdown Report: ${mdReportPath}`)
  console.log(`B4 Hit@4: ${b4Report.overall.hitAt4}%, MRR@4: ${b4Report.overall.mrrAt4}, Wrong-Model Rate: ${b4Report.overall.wrongModelRate}%`)
}

runAllBenchmarks().catch((err) => {
  console.error('Benchmark run failed:', err)
  process.exit(1)
})
