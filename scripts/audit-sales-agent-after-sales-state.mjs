import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

const baseUrlArg = process.argv.find((arg) => arg.startsWith('--base-url='))
const baseUrl = baseUrlArg?.slice('--base-url='.length).replace(/\/$/, '')
const caseArg = process.argv.find((arg) => arg.startsWith('--case='))
const caseId = caseArg?.slice('--case='.length)
const assertLive = process.argv.includes('--assert')
const probeManual = process.argv.includes('--probe-manual') || assertLive

if (assertLive && !baseUrl) {
  throw new Error('Gate live cần --base-url=<URL sales agent đang chạy>.')
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey)
const fixture = JSON.parse(await readFile(
  new URL('../lib/sales-agent/evals/fixtures/after-sales-access.json', import.meta.url),
  'utf8',
))

async function exactCount(table) {
  const result = await supabase.from(table).select('*', { count: 'exact', head: true })
  return { count: result.count ?? 0, error: result.error?.message ?? null }
}

function groupCount(rows, keys) {
  return Object.fromEntries(Object.entries(rows.reduce((groups, row) => {
    const key = keys.map((field) => row[field] ?? 'null').join('|')
    groups[key] = (groups[key] ?? 0) + 1
    return groups
  }, {})).sort(([left], [right]) => left.localeCompare(right)))
}

function normalizeForMatch(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function evaluateLiveCase(item, liveCase) {
  const answer = normalizeForMatch(liveCase.answer)
  const requiredFailures = (item.requiredAnswerTermGroups ?? [])
    .filter((alternatives) => !alternatives.some((term) => answer.includes(normalizeForMatch(term))))
  const forbiddenMatches = (item.forbiddenAnswerTerms ?? [])
    .filter((term) => answer.includes(normalizeForMatch(term)))
  const expectedToolCompleted = item.expectedTool
    ? liveCase.tools.includes(`${item.expectedTool}:complete`)
    : true
  const completenessMatches = item.expectedCompleteness
    ? liveCase.completeness === item.expectedCompleteness
    : true
  const failures = []

  if (liveCase.httpStatus !== 200) failures.push(`HTTP ${liveCase.httpStatus}`)
  if (liveCase.error) failures.push('SSE trả event error')
  if (!expectedToolCompleted) failures.push(`Tool ${item.expectedTool} chưa complete`)
  if (!completenessMatches) failures.push(`Completeness ${liveCase.completeness ?? 'null'} != ${item.expectedCompleteness}`)
  if (requiredFailures.length > 0) {
    failures.push(`Thiếu ${requiredFailures.map((group) => group.join(' | ')).join('; ')}`)
  }
  if (forbiddenMatches.length > 0) {
    failures.push(`Có nội dung cấm: ${forbiddenMatches.join(', ')}`)
  }

  return {
    pass: failures.length === 0,
    failures,
  }
}

async function runLiveCase(item, index) {
  const response = await fetch(`${baseUrl}/api/v1/sales-agent/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `after-sales-audit-${index}`,
    },
    body: JSON.stringify({ message: item.query, locale: 'vi-VN' }),
    signal: AbortSignal.timeout(70_000),
  })
  const raw = await response.text()
  const events = raw
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .flatMap((line) => {
      try {
        return [JSON.parse(line.slice(6))]
      } catch {
        return []
      }
    })
  const viewModel = events.find((event) => event.type === 'turn_view')?.viewModel
  return {
    id: item.id,
    query: item.query,
    expectedStatus: item.currentStatus,
    httpStatus: response.status,
    tools: events
      .filter((event) => event.type === 'tool_status')
      .map((event) => `${event.tool}:${event.status}`),
    completeness: viewModel?.answer?.completeness ?? null,
    answer: viewModel?.answer?.markdown ?? null,
    error: events.find((event) => event.type === 'error') ?? null,
  }
}

const [releaseResult, factsResult, locationsResult, counts, cachedChunkSample] = await Promise.all([
  supabase.from('after_sales_current_published_release').select('release_id,published_at,counts').maybeSingle(),
  supabase.from('after_sales_published_facts').select('service_type,vehicle_type,fact_type'),
  supabase.from('after_sales_published_service_locations').select('location_category,vehicle_types,address,service_hours,operational_status'),
  Promise.all([
    'after_sales_published_facts',
    'after_sales_published_service_locations',
    'sales_agent_knowledge_documents',
    'sales_agent_knowledge_chunks',
    'manual_models',
    'manual_articles',
    'manual_article_chunks',
  ].map(async (table) => [table, await exactCount(table)])),
  supabase
    .from('sales_agent_knowledge_chunks')
    .select('document_id,sales_agent_knowledge_documents!inner(slug,status)')
    .eq('is_active', true)
    .eq('sales_agent_knowledge_documents.status', 'PUBLISHED')
    .limit(200),
])

const facts = factsResult.data ?? []
const locations = locationsResult.data ?? []
const sampledDocuments = groupCount(
  (cachedChunkSample.data ?? []).map((row) => ({
    slug: (Array.isArray(row.sales_agent_knowledge_documents)
      ? row.sales_agent_knowledge_documents[0]
      : row.sales_agent_knowledge_documents)?.slug ?? row.document_id,
  })),
  ['slug'],
)

let manualProbe = null
if (probeManual) {
  try {
    const [{ embed }, { createOpenAI }] = await Promise.all([import('ai'), import('@ai-sdk/openai')])
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' })
    const { embedding } = await embed({
      model: openai.embedding('text-embedding-3-small'),
      value: 'vị trí cổng sạc VF 8',
      providerOptions: { openai: { dimensions: 512 } },
    })
    const result = await supabase.rpc('match_manual_chunks', {
      query_embedding: `[${embedding.join(',')}]`,
      match_threshold: 0.3,
      match_count: 3,
      filter_model_series: 'VF 8',
      filter_year: '2024',
    })
    manualProbe = {
      queryEmbeddingDimensions: embedding.length,
      rows: result.data?.length ?? 0,
      error: result.error?.message ?? null,
      matches: (result.data ?? []).map((row) => ({
        articleId: row.article_id,
        articleTitle: row.article_title,
        sectionTitle: row.section_title,
        similarity: row.similarity,
        excerpt: String(row.content ?? '').slice(0, 320),
      })),
    }
  } catch (error) {
    manualProbe = {
      queryEmbeddingDimensions: null,
      rows: 0,
      error: error instanceof Error ? error.message : String(error),
      matches: [],
    }
  }
}

const selectedLiveCases = fixture.filter((item) => item.query && (!caseId || item.id === caseId))
if (caseId && selectedLiveCases.length === 0) {
  throw new Error(`Không tìm thấy audit case: ${caseId}`)
}
const liveCasesWithoutEvaluation = []
if (baseUrl) {
  for (const [index, item] of selectedLiveCases.entries()) {
    liveCasesWithoutEvaluation.push(await runLiveCase(item, index))
  }
}
const liveCases = liveCasesWithoutEvaluation.map((liveCase) => ({
  ...liveCase,
  evaluation: evaluateLiveCase(
    selectedLiveCases.find((item) => item.id === liveCase.id),
    liveCase,
  ),
}))
const semanticManualProbePass = !probeManual || (
  manualProbe?.queryEmbeddingDimensions === 512
  && manualProbe?.rows > 0
  && !manualProbe?.error
)
const failedLiveCases = liveCases.filter((item) => !item.evaluation.pass)
const manualLiveCase = liveCases.find((item) => item.id === 'vf8-manual-charge-port')
const manualRetrievalPass = semanticManualProbePass || manualLiveCase?.evaluation.pass === true
const regression = {
  assertRequested: assertLive,
  semanticManualProbePass,
  manualRetrievalPass,
  totalLiveCases: liveCases.length,
  passedLiveCases: liveCases.length - failedLiveCases.length,
  failedCaseIds: failedLiveCases.map((item) => item.id),
  pass: manualRetrievalPass && failedLiveCases.length === 0,
}

process.stdout.write(`${JSON.stringify({
  checkedAt: new Date().toISOString(),
  release: releaseResult.data ?? null,
  errors: {
    release: releaseResult.error?.message ?? null,
    facts: factsResult.error?.message ?? null,
    locations: locationsResult.error?.message ?? null,
    cachedChunkSample: cachedChunkSample.error?.message ?? null,
  },
  counts: Object.fromEntries(counts),
  publishedCoverage: {
    factsByServiceVehicle: groupCount(facts, ['service_type', 'vehicle_type']),
    locationsByCategory: groupCount(locations, ['location_category']),
    activeMotorbikeWorkshopsInHcm: locations.filter((location) =>
      location.operational_status === 'active'
      && location.location_category === 'electric_motorbike_workshop'
      && location.address?.province === 'Hồ Chí Minh',
    ).length,
  },
  salesAgentKnowledgeCache: {
    configuredLimit: 200,
    sampledRows: cachedChunkSample.data?.length ?? 0,
    sampledDocuments,
  },
  manualProbe,
  expectedCases: fixture,
  liveCases,
  regression,
}, null, 2)}\n`)

if (assertLive && !regression.pass) {
  process.exitCode = 1
}
