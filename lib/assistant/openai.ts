import type { AssistantProduct, RuleResult } from './types'
import type { AssistantFilters } from './types'

type LlmOutput = { message: string; followUpQuestion?: string | null; productIds?: string[] }

export async function extractFiltersWithOpenAI(query: string): Promise<Partial<AssistantFilters> | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key || process.env.ASSISTANT_LLM_EXTRACTION_ENABLED !== 'true') return null
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Number(process.env.ASSISTANT_LLM_TIMEOUT_MS ?? 3500))
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini', temperature: 0, max_output_tokens: 120,
        input: [{ role: 'system', content: 'Trích xuất bộ lọc tìm kiếm FastLane. Chỉ trả JSON. Không đoán tên sản phẩm. productType chỉ car, motorbike, accessory hoặc null; minPrice/maxPrice là VND; sort chỉ price_asc hoặc price_desc.' }, { role: 'user', content: query }],
        text: { format: { type: 'json_schema', name: 'assistant_filters', strict: true, schema: { type: 'object', additionalProperties: false, properties: { productType: { type: ['string', 'null'], enum: ['car', 'motorbike', 'accessory', null] }, minPrice: { type: ['number', 'null'] }, maxPrice: { type: ['number', 'null'] }, sort: { type: ['string', 'null'], enum: ['price_asc', 'price_desc', null] }, terms: { type: 'array', items: { type: 'string' } } }, required: ['productType', 'minPrice', 'maxPrice', 'sort', 'terms'] } } },
      }),
    })
    if (!response.ok) return null
    const payload = await response.json() as any
    const text = payload.output?.flatMap((item: any) => item.content ?? []).find((item: any) => item.type === 'output_text')?.text
    if (!text) return null
    const value = JSON.parse(text) as Record<string, unknown>
    const filters: Partial<AssistantFilters> = {}
    if (value.productType === 'car' || value.productType === 'motorbike' || value.productType === 'accessory') filters.productType = value.productType
    if (typeof value.minPrice === 'number' && Number.isFinite(value.minPrice) && value.minPrice >= 0) filters.minPrice = value.minPrice
    if (typeof value.maxPrice === 'number' && Number.isFinite(value.maxPrice) && value.maxPrice >= 0) filters.maxPrice = value.maxPrice
    if (value.sort === 'price_asc' || value.sort === 'price_desc') filters.sort = value.sort
    if (Array.isArray(value.terms)) filters.terms = value.terms.filter((term): term is string => typeof term === 'string').slice(0, 8)
    return filters
  } catch { return null } finally { clearTimeout(timeout) }
}

export async function summarizeWithOpenAI(rule: RuleResult, products: AssistantProduct[]): Promise<LlmOutput | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key || process.env.ASSISTANT_SEARCH_ENABLED === 'false' || !products.length && rule.intent !== 'casual') return null
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Number(process.env.ASSISTANT_LLM_TIMEOUT_MS ?? 3500))
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini', temperature: 0.2, max_output_tokens: 160,
        input: [{ role: 'system', content: 'Bạn là trợ lý tìm kiếm FastLane. Trả lời tối đa 2 câu ngắn bằng tiếng Việt. Không bịa giá, tồn kho, thông số hoặc sản phẩm. Chỉ sử dụng productIds và facts được cung cấp. Với câu hỏi thông số, nếu facts không chứa câu trả lời thì nói dữ liệu chưa được cập nhật. Nếu intent là recommendation và kết quả được xếp hạng theo một tiêu chí (nhanh nhất, xa nhất, công suất hoặc pin), bắt buộc nêu đúng giá trị của tiêu chí đó trong câu trả lời; không chỉ nêu giá.' },
          { role: 'user', content: JSON.stringify({ intent: rule.intent, query: rule.normalizedQuery, products: products.map(({ id, name, category, displayed_price, facts }) => ({ id, name, category, displayed_price, facts })) }) }],
        text: { format: { type: 'json_schema', name: 'assistant_search', strict: true, schema: { type: 'object', additionalProperties: false, properties: { message: { type: 'string' }, followUpQuestion: { type: ['string', 'null'] }, productIds: { type: 'array', items: { type: 'string' } } }, required: ['message', 'followUpQuestion', 'productIds'] } } },
      }),
    })
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null) as { error?: { code?: string; type?: string } } | null
      console.warn('OpenAI assistant response unavailable', {
        status: response.status,
        code: errorPayload?.error?.code,
        type: errorPayload?.error?.type,
      })
      return null
    }
    const payload = await response.json() as any
    const text = payload.output?.flatMap((item: any) => item.content ?? []).find((item: any) => item.type === 'output_text')?.text
    if (!text) return null
    const parsed = JSON.parse(text) as LlmOutput
    const allowed = new Set(products.map((item) => item.id))
    return { ...parsed, productIds: (parsed.productIds ?? []).filter((id) => allowed.has(id)) }
  } catch (error) {
    console.warn('OpenAI assistant response failed', {
      reason: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
    })
    return null
  } finally { clearTimeout(timeout) }
}
