export type SearchIntent = 'casual' | 'product_search' | 'recommendation' | 'product_faq' | 'unsupported'

export type AssistantFilters = {
  productType?: 'car' | 'motorbike' | 'accessory'
  maxPrice?: number
  minPrice?: number
  sort?: 'price_asc' | 'price_desc'
  terms?: string[]
}

export type AssistantProduct = {
  id: string
  name: string
  slug: string
  category: string
  displayed_price: number | null
  image_urls: string[]
  facts?: Record<string, string>
}

export type RuleResult = {
  intent: SearchIntent
  confidence: number
  normalizedQuery: string
  catalogQuery: string
  filters: AssistantFilters
}

export type AssistantResponse = {
  intent: SearchIntent
  message: string | null
  followUpQuestion: string | null
  products: AssistantProduct[]
  source: 'rules' | 'rules+llm'
}
