import { NextResponse } from 'next/server'
import { classifySearchQuery, normalizeAssistantQuery } from '@/lib/assistant/rules'
import { retrieveCatalogProducts } from '@/lib/assistant/catalog-context'
import { extractFiltersWithOpenAI, summarizeWithOpenAI } from '@/lib/assistant/openai'
import type { AssistantResponse } from '@/lib/assistant/types'

const FAQ_FACT_TOPICS = [
  { query: /(di duoc|bao xa|pham vi|quang duong)/, fact: /(distance|range|quang.duong|pham.vi)/i, label: 'phạm vi di chuyển' },
  { query: /(cong suat)/, fact: /(maxpower|max_power|powertrain|cong.suat)/i, label: 'công suất' },
  { query: /(toc do)/, fact: /(topspeed|speed|toc.do)/i, label: 'tốc độ' },
  { query: /(pin|dung luong)/, fact: /(battery|capacity|pin|dung.luong)/i, label: 'thông tin pin' },
] as const

function focusFaqProducts(catalogQuery: string, products: Awaited<ReturnType<typeof retrieveCatalogProducts>>) {
  const normalizedQuery = normalizeAssistantQuery(catalogQuery)
  if (!normalizedQuery || normalizedQuery === 'vinfast') return normalizedQuery === 'vinfast' ? [] : products
  const exact = products.filter((product) => {
    const name = normalizeAssistantQuery(product.name)
    return name === normalizedQuery || name.endsWith(` ${normalizedQuery}`)
  })
  return exact.length ? exact : products
}

function faqFallbackMessage(query: string, products: Awaited<ReturnType<typeof retrieveCatalogProducts>>) {
  const topic = FAQ_FACT_TOPICS.find((item) => item.query.test(query))
  if (products.length !== 1) {
    return /(bao hanh|chinh sach)/.test(query)
      ? 'Dữ liệu chính sách và bảo hành chưa được cập nhật trong catalog.'
      : null
  }
  if (!topic) return null
  const fact = Object.entries(products[0].facts ?? {}).find(([key]) => topic.fact.test(normalizeAssistantQuery(key)))
  return fact
    ? `${products[0].name} có ${topic.label}: ${fact[1]}.`
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
    const llm = await summarizeWithOpenAI(rule, [])
    const response: AssistantResponse = { intent: rule.intent, message: llm?.message ?? 'Xin chào! Mình có thể giúp bạn tìm ô tô điện, xe máy điện và phụ kiện.', followUpQuestion: llm?.followUpQuestion ?? 'Bạn đang quan tâm đến ô tô, xe máy điện hay phụ kiện?', products: [], source: llm ? 'rules+llm' : 'rules' }
    return NextResponse.json({ data: response })
  }
  try {
    const extracted = await extractFiltersWithOpenAI(query)
    if (extracted) {
      if (!rule.filters.productType && extracted.productType) rule.filters.productType = extracted.productType
      if (rule.filters.minPrice == null && extracted.minPrice != null) rule.filters.minPrice = extracted.minPrice
      if (rule.filters.maxPrice == null && extracted.maxPrice != null) rule.filters.maxPrice = extracted.maxPrice
      if (!rule.filters.sort && extracted.sort) rule.filters.sort = extracted.sort
    }
    const requestedLimit = typeof body.limit === 'number' ? Math.min(Math.max(body.limit, 1), 12) : 8
    const resultLimit = /\b(tat ca|toan bo)\b/.test(rule.normalizedQuery) ? 50 : requestedLimit
    let products = await retrieveCatalogProducts(rule.catalogQuery, rule.filters, resultLimit)
    if (rule.intent === 'product_faq') products = focusFaqProducts(rule.catalogQuery, products)
    const llm = await summarizeWithOpenAI(rule, products.slice(0, 12))
    const publicProducts = products.map(({ facts: _facts, ...product }) => product)
    const fallbackMessage = (rule.intent === 'product_faq' && faqFallbackMessage(rule.normalizedQuery, products)) || (products.length === 1
      ? `Mình đã tìm thấy ${products[0].name}${products[0].displayed_price ? `, giá hiện tại ${new Intl.NumberFormat('vi-VN').format(products[0].displayed_price)} ₫` : ''}.`
      : products.length > 1
        ? `Mình tìm thấy ${products.length} sản phẩm phù hợp với “${rule.catalogQuery || query}”.`
        : 'Mình chưa tìm thấy sản phẩm phù hợp. Bạn thử đổi từ khóa hoặc ngân sách nhé.')
    const response: AssistantResponse = { intent: rule.intent, message: llm?.message ?? fallbackMessage, followUpQuestion: llm?.followUpQuestion ?? (products.length ? null : 'Bạn muốn tìm theo dòng xe, loại sản phẩm hay ngân sách?'), products: publicProducts, source: llm ? 'rules+llm' : 'rules' }
    return NextResponse.json({ data: response })
  } catch (error) {
    console.error('Assistant catalog search failed', error)
    return NextResponse.json({ error: { code: 'ASSISTANT_SEARCH_FAILED', message: 'Chưa thể tìm kiếm sản phẩm lúc này.' } }, { status: 503 })
  }
}
