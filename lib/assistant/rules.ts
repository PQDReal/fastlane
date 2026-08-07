import type { AssistantFilters, RuleResult } from './types'
import { normalizeProductSearchText } from '@/lib/catalog/search'
import { CONVERSATION_STOP_WORDS, FAQ_WORDS, RECOMMENDATION_WORDS } from './config'

const normalized = (value: string) => normalizeProductSearchText(value)


/** Removes conversational filler while preserving model names and product terms. */
export function extractCatalogSearchQuery(input: string) {
  const query = normalized(input)
  const tokens = query.split(' ').filter(Boolean)
  const meaningful = tokens.filter((token, index) => {
    if (CONVERSATION_STOP_WORDS.has(token)) return false
    const isBudgetNumber = /^\d+(?:[.,]\d+)?$/.test(token)
      && ['trieu', 'nghin', 'ngan', 'vnd'].includes(tokens[index + 1] ?? '')
    return !isBudgetNumber
  })
  return meaningful.join(' ')
}

function removeIntentWords(query: string, words: ReadonlySet<string>) {
  return query.split(' ').filter((token) => token && !words.has(token)).join(' ')
}


function priceFromQuery(query: string): number | undefined {
  const match = query.match(/(\d+(?:[.,]\d+)?)\s*(tr(?:iệu)?|k|nghin|ngan|vnđ|vnd|đ)?/i)
  if (!match) return undefined
  const amount = Number(match[1].replace(',', '.'))
  if (!Number.isFinite(amount)) return undefined
  const unit = normalized(match[2] ?? '')
  if (unit.startsWith('tr')) return Math.round(amount * 1_000_000)
  if (unit === 'k' || unit.includes('nghin') || unit.includes('ngan')) return Math.round(amount * 1_000)
  return amount >= 1000 ? Math.round(amount) : undefined
}

function priceRangeFromQuery(query: string) {
  /* range parser */
  const match = query.match(/(?:tu\s*)?(\d+(?:[.,]\d+)?)\s*(tr(?:ieu|iệu)?|k|nghin|ngan|vnđ|vnd|đ)?\s*(?:den|toi)\s*(\d+(?:[.,]\d+)?)\s*(tr(?:ieu|iệu)?|k|nghin|ngan|vnđ|vnd|đ)?/i)
  if (!match) return undefined
  const toAmount = (value: string, unit = '') => {
    const amount = Number(value.replace(',', '.'))
    const normalizedUnit = normalized(unit)
    if (normalizedUnit.startsWith('tr')) return Math.round(amount * 1_000_000)
    if (normalizedUnit === 'k' || normalizedUnit.includes('nghin') || normalizedUnit.includes('ngan')) return Math.round(amount * 1_000)
    return amount >= 1000 ? Math.round(amount) : undefined
  }
  const first = toAmount(match[1], match[2])
  const second = toAmount(match[3], match[4] || match[2])
  return first != null && second != null ? { min: Math.min(first, second), max: Math.max(first, second) } : undefined
}

function priceRangeFromQuerySafe(query: string) {
  const match = query.match(/(?:tu\s*)?(\d+(?:[.,]\d+)?)\s*(tr(?:ieu)?|k|nghin|ngan|vnd|đ)?\s*(?:den|toi)\s*(\d+(?:[.,]\d+)?)\s*(tr(?:ieu)?|k|nghin|ngan|vnd|đ)?/i)
  if (!match) return undefined
  const toAmount = (value: string, unit = '') => {
    const amount = Number(value.replace(',', '.'))
    const normalizedUnit = normalized(unit)
    if (normalizedUnit.startsWith('tr')) return Math.round(amount * 1_000_000)
    if (normalizedUnit === 'k' || normalizedUnit.includes('nghin') || normalizedUnit.includes('ngan')) return Math.round(amount * 1_000)
    return amount >= 1000 ? Math.round(amount) : undefined
  }
  const first = toAmount(match[1], match[2] || match[4])
  const second = toAmount(match[3], match[4] || match[2])
  return first != null && second != null ? { min: Math.min(first, second), max: Math.max(first, second) } : undefined
}

export function classifySearchQuery(input: string): RuleResult {
  const query = normalized(input)
  const catalogQuery = extractCatalogSearchQuery(input)
  const filters: AssistantFilters = {}
  if (/(phu kien|accessor|tam che|tham san|sac|bao da|dan film|rem tran|ao phong|binh giu nhiet)/.test(query)) filters.productType = 'accessory'
  else if (/xe may|scooter|motorbike/.test(query)) filters.productType = 'motorbike'
  else if (/\bo to\b|\boto\b|\bcar\b|\bsuv\b|\bsedan\b|\bvf\s*\d+\b/.test(query)) filters.productType = 'car'

  const range = priceRangeFromQuerySafe(query)
  const budget = priceFromQuery(query)
  if (range) {
    filters.minPrice = range.min
    filters.maxPrice = range.max
  } else if (budget) {
    const hasExplicitMinimum = /(khong thap hon|khong duoi|tren|\btu\b|toi thieu|it nhat|cao hon|lon hon|\bhon\b|min)/.test(query)
    const hasExplicitMaximum = /(khong cao hon|khong hon|duoi|toi da|khong qua|nho hon|thap hon|re hon|max)/.test(query)
    if (/(khong thap hon|khong duoi)/.test(query)) filters.minPrice = budget
    else if (/(khong cao hon|khong hon|nho hon|thap hon|re hon)/.test(query)) filters.maxPrice = budget
    else if (hasExplicitMinimum) filters.minPrice = budget
    else if (hasExplicitMaximum) filters.maxPrice = budget
    else if (/(gia|ngan sach|tam gia|khoang|trong khoang)/.test(query)) filters.maxPrice = budget
  }

  if (/\b(re|thap) nhat\b/.test(query)) { filters.sort = 'price_asc'; filters.sortBy = 'price'; filters.sortDirection = 'asc' }
  if (/\b(dat|cao) nhat\b/.test(query)) { filters.sort = 'price_desc'; filters.sortBy = 'price'; filters.sortDirection = 'desc' }
  const descending = /\b(nhanh|xa|cao|lon|manh) nhat\b/.test(query)
  const ascending = /\b(cham|ngan|thap|nho|yeu) nhat\b/.test(query)
  if (/\b(nhanh|cham) nhat\b|\btoc do (cao|thap) nhat\b/.test(query)) { filters.sortBy = 'top_speed'; filters.sortDirection = descending || /toc do cao nhat/.test(query) ? 'desc' : 'asc' }
  if (/\b(xa|ngan) nhat\b|\b(pham vi|quang duong|tam hoat dong) (lon|nho|xa|ngan) nhat\b/.test(query)) { filters.sortBy = 'range'; filters.sortDirection = descending || /\b(pham vi|quang duong|tam hoat dong) (lon|xa) nhat\b/.test(query) ? 'desc' : 'asc' }
  if (/\b(cong suat (cao|thap)|manh|yeu) nhat\b/.test(query)) { filters.sortBy = 'power'; filters.sortDirection = descending || /cong suat cao nhat/.test(query) ? 'desc' : 'asc' }
  if (/\b(pin|dung luong pin) (lon|nho) nhat\b/.test(query)) { filters.sortBy = 'battery'; filters.sortDirection = descending ? 'desc' : 'asc' }
  // Require an explicit color/gender context to avoid collisions such as
  // "tìm" -> "tim" and "tốc độ" -> "do" after normalization.
  const colorMatch = query.match(/\bmau\s+(den|trang|do|xanh|vang|xam|bac|hong|tim|nau)\b/)
  if (colorMatch) filters.color = colorMatch[1]
  const genderMatch = query.match(/\b(?:cho|danh cho|gioi tinh)\s+(nam(?:\s+gioi)?|nu(?:\s+gioi)?|unisex)\b/)
  if (genderMatch) filters.gender = genderMatch[1].replace(/\s+gioi$/, '')

  if (/^(xin chao|chao|hello|hi|hey|cam on|thank|ban la ai|giup toi)/.test(query)) {
    return { intent: 'casual', confidence: 0.95, normalizedQuery: query, catalogQuery, filters }
  }
  if (filters.maxPrice || filters.minPrice || filters.sort || filters.sortBy || filters.color || filters.gender || /(phu hop|goi y|nen mua|tu van|ngan sach)/.test(query)) {
    return { intent: 'recommendation', confidence: 0.9, normalizedQuery: query, catalogQuery: removeIntentWords(catalogQuery, RECOMMENDATION_WORDS), filters }
  }
  if (/(bao hanh|thong so|phanh|pin|pham vi|toc do|cong suat|chinh sach|bao xa|di duoc)/.test(query)) {
    return { intent: 'product_faq', confidence: 0.82, normalizedQuery: query, catalogQuery: removeIntentWords(catalogQuery, FAQ_WORDS), filters }
  }
  if (query.length >= 2) return { intent: 'product_search', confidence: 0.75, normalizedQuery: query, catalogQuery, filters }
  return { intent: 'unsupported', confidence: 0.5, normalizedQuery: query, catalogQuery, filters }
}

export const normalizeAssistantQuery = normalized
