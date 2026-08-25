import { NextResponse } from 'next/server'
import { classifySearchQuery, normalizeAssistantQuery } from '@/lib/assistant/rules'
import { retrieveCatalogProducts } from '@/lib/assistant/catalog-context'
import {
  findAssistantFaqTopic,
  findLegacyAssistantFaqFact,
  resolveAssistantFaqFact,
} from '@/lib/assistant/faq-facts'
import {
  loadCanonicalAssistantFacts,
  resolveCatalogFactReadMode,
} from '@/lib/catalog-intelligence/assistant-facts'
import type { AssistantResponse } from '@/lib/assistant/types'

function focusFaqProducts(catalogQuery: string, products: Awaited<ReturnType<typeof retrieveCatalogProducts>>) {
  const normalizedQuery = normalizeAssistantQuery(catalogQuery)
  if (!normalizedQuery || normalizedQuery === 'vinfast') return normalizedQuery === 'vinfast' ? [] : products
  const exact = products.filter((product) => {
    const name = normalizeAssistantQuery(product.name)
    return name === normalizedQuery || name.endsWith(` ${normalizedQuery}`)
  })
  return exact.length ? exact : products
}

async function faqFallbackMessage(query: string, products: Awaited<ReturnType<typeof retrieveCatalogProducts>>) {
  const topic = findAssistantFaqTopic(query)
  if (products.length !== 1) {
    return /(bao hanh|chinh sach)/.test(query)
      ? 'Dữ liệu chính sách và bảo hành chưa được cập nhật.'
      : null
  }
  if (!topic) return null
  const product = products[0]
  const mode = resolveCatalogFactReadMode()
  const legacyValue = findLegacyAssistantFaqFact(topic, product.facts)
  const canonicalRead = mode !== 'legacy' && topic.cutover === 'READY'
    ? await loadCanonicalAssistantFacts([product.id], [topic.canonicalKey])
    : { status: 'available' as const, facts: [], errorCode: null }
  const resolution = resolveAssistantFaqFact({
    mode,
    topic,
    legacyValue,
    canonicalReadStatus: canonicalRead.status,
    canonicalFacts: canonicalRead.facts.filter((fact) => fact.productId === product.id),
  })

  if (mode !== 'legacy' && topic.cutover === 'READY') {
    const logContext = {
      productId: product.id,
      canonicalKey: topic.canonicalKey,
      mode,
      status: resolution.shadowStatus,
      errorCode: canonicalRead.errorCode,
    }
    if (canonicalRead.status === 'unavailable') {
      console.warn('[CATALOG_FACT_READ] Canonical FAQ read unavailable; using legacy fallback.', logContext)
    } else {
      console.info(mode === 'shadow' ? '[CATALOG_FACT_SHADOW]' : '[CATALOG_FACT_READ]', logContext)
    }
  }

  return resolution.value
    ? `${product.name} có ${topic.label}: ${resolution.value}.`
    : `Dữ liệu về ${topic.label} của ${products[0].name} chưa được cập nhật.`
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { query?: unknown; limit?: unknown }
  const query = typeof body.query === 'string' ? body.query.trim().slice(0, 200) : ''
  if (!query) return NextResponse.json({ error: { code: 'INVALID_QUERY', message: 'Vui lòng nhập nội dung tìm kiếm.' } }, { status: 400 })
  const rule = classifySearchQuery(query)
  if (rule.intent === 'unsupported') {
    const response: AssistantResponse = {
      intent: rule.intent,
      message: 'Mình chưa hiểu yêu cầu này. Bạn có thể nhập tên xe, phụ kiện, mức giá hoặc câu hỏi cụ thể hơn.',
      followUpQuestion: 'Ví dụ: “VF 9 đi được bao xa?” hoặc “xe máy dưới 20 triệu”.',
      products: [],
      source: 'rules',
    }
    return NextResponse.json({ data: response })
  }
  if (rule.intent === 'casual') {
    const response: AssistantResponse = { intent: rule.intent, message: 'Xin chào! Mình có thể giúp bạn tìm ô tô điện, xe máy điện và phụ kiện.', followUpQuestion: 'Bạn đang quan tâm đến ô tô, xe máy điện hay phụ kiện?', products: [], source: 'rules' }
    return NextResponse.json({ data: response })
  }
  try {
    const requestedLimit = typeof body.limit === 'number' ? Math.min(Math.max(body.limit, 1), 100) : 12
    const broadCatalogRequest =
      !rule.filters.sort &&
      !rule.filters.sortBy &&
      rule.filters.minPrice == null &&
      rule.filters.maxPrice == null &&
      /\b(?:liet ke|danh sach|tat ca|toan bo)\b/.test(rule.normalizedQuery) ||
      (!rule.filters.sort && !rule.filters.sortBy && /\bxe may dien\b/.test(rule.normalizedQuery))
    const resultLimit = rule.filters.sort || rule.filters.sortBy
      ? 1
      : broadCatalogRequest
        ? 100
        : requestedLimit
    let products = await retrieveCatalogProducts(rule.catalogQuery, rule.filters, resultLimit)
    if (rule.intent === 'product_faq') products = focusFaqProducts(rule.catalogQuery, products)
    const publicProducts = products.map(({ facts: _facts, searchableText: _searchableText, ...product }) => product)
    const rankingProduct = rule.filters.sortBy && products[0]
    const rankingPattern = rule.filters.sortBy === 'top_speed' ? /(speed|toc.?do)/i : rule.filters.sortBy === 'range' ? /(distance|range|quang.?duong|pham.?vi)/i : rule.filters.sortBy === 'power' ? /(power|cong.?suat)/i : /(battery|capacity|dung.?luong|pin)/i
    // Price rankings are self-explanatory; do not append an unrelated
    // technical fact (for example battery capacity) to those responses.
    const rankingFact = rankingProduct && rule.filters.sortBy !== 'price'
      ? Object.entries(rankingProduct.facts ?? {}).find(([key]) => rankingPattern.test(normalizeAssistantQuery(key)))
      : undefined
    const faqMessage = rule.intent === 'product_faq'
      ? await faqFallbackMessage(rule.normalizedQuery, products)
      : null
    const fallbackMessage = faqMessage || (rule.filters.sortBy && products.length === 0
      ? `Mình chưa có thông tin ${rule.filters.sortBy === 'top_speed' ? 'tốc độ tối đa' : rule.filters.sortBy === 'range' ? 'phạm vi di chuyển' : rule.filters.sortBy === 'power' ? 'công suất' : 'dung lượng pin'} để xếp hạng cho sản phẩm “${rule.catalogQuery || query}”.`
      : products.length === 1
      ? `Mình đã tìm thấy ${products[0].name}${rankingFact ? `, thông số dùng để xếp hạng: ${rankingFact[1]}` : ''}${products[0].displayed_price ? `, giá hiện tại ${new Intl.NumberFormat('vi-VN').format(products[0].displayed_price)} ₫` : ''}.`
      : products.length > 1
        ? `Mình tìm thấy ${products.length} sản phẩm phù hợp với “${rule.catalogQuery || query}”.`
        : 'Mình chưa tìm thấy sản phẩm phù hợp. Bạn thử đổi từ khóa hoặc ngân sách nhé.')
    const rankingMessage = fallbackMessage
    const response: AssistantResponse = { intent: rule.intent, message: rankingMessage, followUpQuestion: products.length ? null : 'Bạn muốn tìm theo dòng xe, loại sản phẩm hay ngân sách?', products: publicProducts, source: 'rules' }
    return NextResponse.json({ data: response })
  } catch (error) {
    console.error('Assistant catalog search failed', error)
    return NextResponse.json({ error: { code: 'ASSISTANT_SEARCH_FAILED', message: 'Chưa thể tìm kiếm sản phẩm lúc này.' } }, { status: 503 })
  }
}
