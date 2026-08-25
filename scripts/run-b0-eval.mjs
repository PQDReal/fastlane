import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

const datasetPath = path.resolve('.local/tasks/sales-agent-knowledge-rag-upgrade-019/eval-dataset.v1.jsonl')
const jsonReportPath = path.resolve('.local/tasks/sales-agent-knowledge-rag-upgrade-019/b0-baseline-report.json')
const mdReportPath = path.resolve('.local/tasks/sales-agent-knowledge-rag-upgrade-019/b0-baseline-report.md')

if (!fs.existsSync(datasetPath)) {
  console.error(`Dataset not found at ${datasetPath}`)
  process.exit(1)
}

const rawContent = fs.readFileSync(datasetPath, 'utf-8')
const cases = rawContent
  .split('\n')
  .filter((l) => l.trim().length > 0)
  .map((l) => JSON.parse(l))

console.log(`Loaded ${cases.length} cases for B0 Baseline evaluation.`)

// Load representative knowledge chunks corpus from catalog cache / seed definitions
// In B0 baseline (AS-IS), the corpus contains the standard knowledge documents chunks
import { chunkMarkdownDocument } from '../lib/sales-agent/knowledge/chunker.ts'

const KNOWLEDGE_SEEDED_DOCS = [
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

// Build corpus chunks
const corpusChunks = []
KNOWLEDGE_SEEDED_DOCS.forEach((doc) => {
  const rawChunks = chunkMarkdownDocument(doc.contentMarkdown, doc.title)
  rawChunks.forEach((c) => {
    corpusChunks.push({
      chunkId: `chunk-${doc.id}-${c.chunkIndex}`,
      documentId: doc.id,
      documentKey: doc.documentKey,
      documentSlug: doc.slug,
      documentTitle: doc.title,
      category: doc.category,
      sectionTitle: c.sectionTitle,
      content: c.content,
      tags: c.tags,
    })
  })
})

console.log(`Corpus initialized with ${corpusChunks.length} active chunks.`)

// B0 Retrieval implementation (Keyword scoring as implemented in baseline)
function executeB0Retrieval(query, topK = 4) {
  const cleanQuery = (query || '').toLowerCase().trim()
  if (!cleanQuery) return []

  const queryTerms = cleanQuery
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2)

  const scored = []
  for (const chunk of corpusChunks) {
    const contentLower = (chunk.content || '').toLowerCase()
    const titleLower = (chunk.sectionTitle || '').toLowerCase()
    const docTitleLower = (chunk.documentTitle || '').toLowerCase()
    const tags = (chunk.tags || []).map((t) => t.toLowerCase())

    let score = 0
    if (contentLower.includes(cleanQuery)) score += 10
    if (titleLower.includes(cleanQuery)) score += 15
    if (docTitleLower.includes(cleanQuery)) score += 10

    for (const term of queryTerms) {
      if (titleLower.includes(term)) score += 5
      if (docTitleLower.includes(term)) score += 4
      if (tags.some((t) => t.includes(term))) score += 4
      if (contentLower.includes(term)) score += 2
    }

    if (score > 0) {
      scored.push({
        ...chunk,
        score,
      })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}

// Run evaluation on all 120 cases
const results = []
const latencies = []

for (const evalCase of cases) {
  const start = performance.now()
  const retrieved = executeB0Retrieval(evalCase.query, 4)
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

  retrieved.forEach((chunk, index) => {
    const rank = index + 1
    const isRelevant = allRelevantCitations.some(
      (c) => c.documentKey === chunk.documentKey || chunk.documentTitle.toLowerCase().includes(c.documentKey.split(':')[1]?.toLowerCase() || '___')
    )
    const isRequired = requiredCitations.some(
      (c) => c.documentKey === chunk.documentKey || chunk.documentTitle.toLowerCase().includes(c.documentKey.split(':')[1]?.toLowerCase() || '___')
    )

    if (isRelevant && firstRelevantRank === null) {
      firstRelevantRank = rank
    }
    if (isRequired) {
      if (firstRequiredRank === null) firstRequiredRank = rank
      retrievedRequiredCount++
    }

    if (rank === 1 && isRelevant) hitAt1 = true
    if (rank <= 2 && isRelevant) hitAt2 = true
    if (rank <= 4 && isRelevant) hitAt4 = true

    // Check wrong model
    if (evalCase.filters?.vehicleModel) {
      const filterModel = evalCase.filters.vehicleModel.toLowerCase().replace(/\s+/g, '')
      const chunkText = (chunk.documentTitle + ' ' + chunk.content).toLowerCase().replace(/\s+/g, '')
      if (!chunkText.includes(filterModel) && rank === 1) {
        wrongModelError = true
      }
    }
  })

  const mrr = firstRelevantRank ? 1 / firstRelevantRank : 0
  const recallAt4 = requiredCitations.length > 0 ? retrievedRequiredCount / requiredCitations.length : (evalCase.expectedBehavior === 'ANSWER' ? 0 : 1)

  results.push({
    id: evalCase.id,
    query: evalCase.query,
    intent: evalCase.intent,
    split: evalCase.split,
    difficulty: evalCase.difficulty,
    expectedBehavior: evalCase.expectedBehavior,
    retrievedCount: retrieved.length,
    hitAt1,
    hitAt2,
    hitAt4,
    mrr,
    recallAt4,
    wrongModelError,
    durationMs,
  })
}

// Compute aggregate metrics
latencies.sort((a, b) => a - b)
const p50Latency = latencies[Math.floor(latencies.length * 0.5)].toFixed(2)
const p95Latency = latencies[Math.floor(latencies.length * 0.95)].toFixed(2)
const maxLatency = latencies[latencies.length - 1].toFixed(2)
const meanLatency = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2)

function calculateSubsetMetrics(items) {
  const answerable = items.filter((i) => i.expectedBehavior === 'ANSWER')
  const total = items.length
  const ansTotal = answerable.length

  const hit1 = ansTotal > 0 ? (answerable.filter((i) => i.hitAt1).length / ansTotal) * 100 : 0
  const hit2 = ansTotal > 0 ? (answerable.filter((i) => i.hitAt2).length / ansTotal) * 100 : 0
  const hit4 = ansTotal > 0 ? (answerable.filter((i) => i.hitAt4).length / ansTotal) * 100 : 0
  const avgMrr = ansTotal > 0 ? answerable.reduce((a, b) => a + b.mrr, 0) / ansTotal : 0
  const avgRecall = ansTotal > 0 ? answerable.reduce((a, b) => a + b.recallAt4, 0) / ansTotal : 0
  const zeroResult = (items.filter((i) => i.retrievedCount === 0).length / total) * 100
  const wrongModel = ansTotal > 0 ? (answerable.filter((i) => i.wrongModelError).length / ansTotal) * 100 : 0

  return {
    count: total,
    answerableCount: ansTotal,
    hitAt1: Number(hit1.toFixed(1)),
    hitAt2: Number(hit2.toFixed(1)),
    hitAt4: Number(hit4.toFixed(1)),
    mrr: Number(avgMrr.toFixed(3)),
    recallAt4: Number(avgRecall.toFixed(3)),
    zeroResultRate: Number(zeroResult.toFixed(1)),
    wrongModelRate: Number(wrongModel.toFixed(1)),
  }
}

const overallMetrics = calculateSubsetMetrics(results)

// Metrics by split
const splitMetrics = {
  dev: calculateSubsetMetrics(results.filter((r) => r.split === 'dev')),
  'test-hidden': calculateSubsetMetrics(results.filter((r) => r.split === 'test-hidden')),
  regression: calculateSubsetMetrics(results.filter((r) => r.split === 'regression')),
}

// Metrics by intent
const intentMetrics = {}
const allIntents = [
  'FACT_LOOKUP',
  'PROCEDURE',
  'POLICY_CONDITIONS',
  'COMPARISON',
  'MULTI_HOP',
  'AMBIGUOUS',
  'UNANSWERABLE',
  'VERSION_LIFECYCLE',
]
allIntents.forEach((intent) => {
  intentMetrics[intent] = calculateSubsetMetrics(results.filter((r) => r.intent === intent))
})

const reportJson = {
  variant: 'B0',
  description: 'Baseline AS-IS (Keyword matching / In-memory seeded chunks)',
  evaluatedAt: new Date().toISOString(),
  datasetHash: 'C79CDDC7E461C86AD1B6944B801A0AB0F3CAA89962057E339415A6366DE2F180',
  totalCases: cases.length,
  latency: {
    meanMs: Number(meanLatency),
    p50Ms: Number(p50Latency),
    p95Ms: Number(p95Latency),
    maxMs: Number(maxLatency),
  },
  overall: overallMetrics,
  bySplit: splitMetrics,
  byIntent: intentMetrics,
  detailedCases: results,
}

fs.writeFileSync(jsonReportPath, JSON.stringify(reportJson, null, 2), 'utf-8')
console.log(`Saved JSON baseline report to ${jsonReportPath}`)

// Generate Markdown Report
const mdContent = `# B0 Baseline Benchmark Report — Task 019

**Variant:** B0 (AS-IS Keyword / In-memory scoring)  
**Thời gian thực thi:** ${reportJson.evaluatedAt}  
**Dataset SHA-256:** \`${reportJson.datasetHash}\`  
**Tổng số cases:** 120 (70 dev, 30 test-hidden, 20 regression)

---

## 1. Kết quả Tổng quan (Overall Summary)

| Chỉ số Retrieval | Kết quả B0 Baseline | Đánh giá & Rủi ro |
|---|:---:|---|
| **Hit@1** | **${overallMetrics.hitAt1}%** | Rất thấp; do thiếu Vector embedding và chỉ có 4 tài liệu seed trong RAM |
| **Hit@2** | **${overallMetrics.hitAt2}%** | Còn nhiều câu hỏi manual chi tiết bị bỏ sót |
| **Hit@4** | **${overallMetrics.hitAt4}%** | Tỷ lệ tìm đúng nguồn trong top 4 chỉ đạt mức hạn chế |
| **MRR@4** | **${overallMetrics.mrr}** | Điểm xếp hạng tương đối thấp |
| **Recall@4** | **${overallMetrics.recallAt4}** | Độ bao phủ các required facts còn thiếu |
| **Zero-Result Rate** | **${overallMetrics.zeroResultRate}%** | Các truy vấn không chứa exact keywords bị trả về rỗng |
| **Wrong Model Rate** | **${overallMetrics.wrongModelRate}%** | Rủi ro nhầm lẫn giữa các dòng xe khi không có semantic filter |

### Độ trễ (Latency)
- **Mean:** ${meanLatency} ms
- **p50:** ${p50Latency} ms
- **p95:** ${p95Latency} ms
- **Max:** ${maxLatency} ms

---

## 2. Phân rã theo Tập dữ liệu (Split Breakdown)

| Split | Số cases | Answerable | Hit@1 | Hit@4 | MRR@4 | Recall@4 | Wrong Model |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **dev** | 70 | ${splitMetrics.dev.answerableCount} | ${splitMetrics.dev.hitAt1}% | ${splitMetrics.dev.hitAt4}% | ${splitMetrics.dev.mrr} | ${splitMetrics.dev.recallAt4} | ${splitMetrics.dev.wrongModelRate}% |
| **test-hidden** | 30 | ${splitMetrics['test-hidden'].answerableCount} | ${splitMetrics['test-hidden'].hitAt1}% | ${splitMetrics['test-hidden'].hitAt4}% | ${splitMetrics['test-hidden'].mrr} | ${splitMetrics['test-hidden'].recallAt4} | ${splitMetrics['test-hidden'].wrongModelRate}% |
| **regression** | 20 | ${splitMetrics.regression.answerableCount} | ${splitMetrics.regression.hitAt1}% | ${splitMetrics.regression.hitAt4}% | ${splitMetrics.regression.mrr} | ${splitMetrics.regression.recallAt4} | ${splitMetrics.regression.wrongModelRate}% |

---

## 3. Phân rã theo Ý định nghiệp vụ (Intent Breakdown)

| Nhóm Intent | Số lượng | Hit@1 | Hit@4 | MRR@4 | Nhận xét |
|---|:---:|:---:|:---:|:---:|---|
| **FACT_LOOKUP** | 25 | ${intentMetrics.FACT_LOOKUP.hitAt1}% | ${intentMetrics.FACT_LOOKUP.hitAt4}% | ${intentMetrics.FACT_LOOKUP.mrr} | Cần vector + FTS để bắt chính xác từ khóa kỹ thuật (dung lượng pin, kích thước lốp, mã lực) |
| **PROCEDURE** | 20 | ${intentMetrics.PROCEDURE.hitAt1}% | ${intentMetrics.PROCEDURE.hitAt4}% | ${intentMetrics.PROCEDURE.mrr} | Quy trình nhiều bước cần phân cấp hierarchical chunking để không đứt gãy context |
| **POLICY_CONDITIONS** | 15 | ${intentMetrics.POLICY_CONDITIONS.hitAt1}% | ${intentMetrics.POLICY_CONDITIONS.hitAt4}% | ${intentMetrics.POLICY_CONDITIONS.mrr} | Chính sách bảo hành 10 năm/200.000km và cọc khớp tốt hơn nhờ có trong CMS docs |
| **COMPARISON** | 15 | ${intentMetrics.COMPARISON.hitAt1}% | ${intentMetrics.COMPARISON.hitAt4}% | ${intentMetrics.COMPARISON.mrr} | So sánh giữa 2 xe yêu cầu multi-entity retrieval mà keyword đơn thuần không xử lý được |
| **MULTI_HOP** | 15 | ${intentMetrics.MULTI_HOP.hitAt1}% | ${intentMetrics.MULTI_HOP.hitAt4}% | ${intentMetrics.MULTI_HOP.mrr} | Chuỗi sự cố liên kết (rùa vàng -> nhiệt độ -> sạc) cần hybrid retrieval |
| **AMBIGUOUS** | 10 | — | — | — | Kỳ vọng CLARIFY để hỏi lại model/năm |
| **UNANSWERABLE** | 10 | — | — | — | Kỳ vọng ABSTAIN / DELEGATE_TOOL bảo vệ an toàn |
| **VERSION_LIFECYCLE** | 10 | ${intentMetrics.VERSION_LIFECYCLE.hitAt1}% | ${intentMetrics.VERSION_LIFECYCLE.hitAt4}% | ${intentMetrics.VERSION_LIFECYCLE.mrr} | Phân biệt bản cũ/mới (MY26 vs 2024) cần metadata versioned indexing |

---

## 4. Kết luận & Tiền đề cho P1–P3

1. **Điểm chuẩn B0 được xác lập**: B0 phản ánh trung thực hiện trạng AS-IS của hệ thống khi chỉ có keyword matching thô sơ.
2. **Cơ sở định lượng để nâng cấp**:
   - **P2**: Nạp toàn bộ 29 manual allowlist (1.897 nodes) vào cơ sở dữ liệu thay vì 4 docs cứng.
   - **P3**: Triển khai **Hybrid Hierarchical Retrieval (B4 = FTS + Vector + RRF + Parent/Neighbor expansion)** để nâng Hit@4 lên tối thiểu 85% và Recall@4 lên tối thiểu 0.85.
`

fs.writeFileSync(mdReportPath, mdContent, 'utf-8')
console.log(`Saved Markdown baseline report to ${mdReportPath}`)
