import { performance } from 'node:perf_hooks'
import { buildEvidenceContext } from '../lib/sales-agent/knowledge/retrieval/context-builder.ts'
import { rerankFusedCandidates } from '../lib/sales-agent/knowledge/retrieval/reranker.ts'
import { HybridHierarchicalRetrievalService } from '../lib/sales-agent/knowledge/retrieval/retrieval-service.ts'

const iterations = Number(process.env.RERANK_BENCHMARK_ITERATIONS || 2000)
const candidateCount = 10
const finalK = 5
const query = 'các nút và tính năng trên vô lăng VF 5'

function makeCandidate(index) {
  const sectionTitle = index === 1
    ? 'Lái xe > Vô lăng > Các phím chức năng (Phần 2)'
    : `Lái xe > Vô lăng > Mục ${index}`

  return {
    chunkId: `bench-${index}`,
    documentId: 'doc-vf5-2025',
    documentKey: 'vinfast:manual:VF5:2025:vi-VN',
    versionId: 'ver-vf5-2025',
    versionNo: 1,
    indexGenerationId: 'openai-text-embedding-3-small-512-v1',
    chunkLevel: 3,
    hierarchyPath: sectionTitle.toLowerCase().replace(/\s+/g, '_'),
    sectionAnchor: `bench-${index}`,
    sectionTitle,
    content: index === 1
      ? '| Nhấn nhanh | Menu bên trái |\n| Nhấn và giữ | Kiểm soát hành trình BẬT/TẮT |'
      : `Nội dung hướng dẫn sử dụng VF 5 cho mục ${index}.`,
    contentHash: `hash-${index}`,
    tokenCount: 120,
    tags: ['VF 5'],
    title: 'Sổ tay hướng dẫn sử dụng VinFast VF 5',
    slug: 'vinfast-vf5-2025',
    category: 'TECHNICAL_GUIDE',
    effectiveFrom: '2025-01-01T00:00:00.000Z',
    effectiveTo: null,
    publicationStatus: 'PUBLISHED',
    indexStatus: 'READY',
    rrfScore: 0.03 - index / 1000,
  }
}

const candidates = Array.from({ length: candidateCount }, (_, index) => makeCandidate(index))

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))
  return Number(sorted[index].toFixed(3))
}

function summarize(values) {
  return {
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    p99Ms: percentile(values, 0.99),
    meanMs: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3)),
  }
}

for (let i = 0; i < 100; i += 1) {
  const ranked = rerankFusedCandidates(query, candidates, { limit: candidateCount })
  buildEvidenceContext(
    ranked.slice(0, finalK).map((candidate) => ({ ...candidate, expansionProvenance: 'DIRECT' })),
    { topK: finalK, tokenBudget: 2500 },
  )
}

const rerankDurations = []
const rerankAndContextDurations = []
const contextOnlyDurations = []
const serviceDurations = []
const serviceRerankDurations = []
const service = new HybridHierarchicalRetrievalService()

for (let i = 0; i < iterations; i += 1) {
  let start = performance.now()
  const ranked = rerankFusedCandidates(query, candidates, { limit: candidateCount })
  const rerankElapsed = performance.now() - start
  rerankDurations.push(rerankElapsed)

  start = performance.now()
  buildEvidenceContext(
    ranked.slice(0, finalK).map((candidate) => ({ ...candidate, expansionProvenance: 'DIRECT' })),
    { topK: finalK, tokenBudget: 2500 },
  )
  const contextElapsed = performance.now() - start
  rerankAndContextDurations.push(rerankElapsed + contextElapsed)

  start = performance.now()
  buildEvidenceContext(
    candidates.slice(0, finalK).map((candidate) => ({ ...candidate, expansionProvenance: 'DIRECT' })),
    { topK: finalK, tokenBudget: 2500 },
  )
  contextOnlyDurations.push(performance.now() - start)

  start = performance.now()
  const response = await service.retrieve(
    query,
    {},
    { retrievalMode: 'FTS', topK: finalK, rerankCandidateLimit: candidateCount },
    candidates,
  )
  serviceDurations.push(performance.now() - start)
  serviceRerankDurations.push(response.telemetry.rerankLatencyMs)
}

const ranked = rerankFusedCandidates(query, candidates, { limit: finalK })
const output = {
  benchmark: 'knowledge-rerank-local-deterministic',
  query,
  candidateCount,
  finalK,
  iterations,
  top5: ranked.map((candidate) => ({ chunkId: candidate.chunkId, score: candidate.rerankScore })),
  rerank: summarize(rerankDurations),
  contextOnly: summarize(contextOnlyDurations),
  rerankPlusContext: summarize(rerankAndContextDurations),
  serviceInMemoryFts: {
    overall: summarize(serviceDurations),
    rerankTelemetry: summarize(serviceRerankDurations),
  },
}

console.log(JSON.stringify(output, null, 2))
