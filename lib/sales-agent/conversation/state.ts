import { normalizeProductSearchText } from '@/lib/catalog/search'
import type { SalesAgentMessage } from '../contracts/message'

export const SALES_AGENT_INTENTS = [
  'CATALOG_RECOMMENDATION',
  'VEHICLE_DETAILS',
  'COMPARE_VEHICLES',
  'PROMOTIONS',
  'ACCESSORIES',
  'NAVIGATION',
] as const

export type SalesAgentIntent = (typeof SALES_AGENT_INTENTS)[number]

export const SALES_AGENT_CRITERIA = [
  'battery_capacity_kwh',
  'top_speed_kmh',
  'range_km',
  'max_power_kw',
  'price',
  'availability',
] as const

export type SalesAgentCriteria = (typeof SALES_AGENT_CRITERIA)[number]
export type SalesAgentProductType = 'CAR' | 'BIKE' | 'ACCESSORY'

export type SalesAgentConversationSlots = {
  vehicleIds?: string[]
  criteria?: SalesAgentCriteria[]
  productType?: SalesAgentProductType
  minPrice?: number
  maxPrice?: number
  usage?: string[]
}

export type SalesAgentConversationState = {
  schemaVersion: '1.0'
  activeIntent?: SalesAgentIntent
  slots: SalesAgentConversationSlots
  pendingInteractionId?: string
  updatedAt: string
}

export type SalesAgentConversationResolutionOptions = {
  previousState?: SalesAgentConversationState
  interactionState?: Pick<SalesAgentConversationState, 'activeIntent' | 'slots' | 'pendingInteractionId'>
  now?: string
}

const STATIC_KNOWLEDGE_PHRASES = ['thu tuc', 'huong dan', 'chinh sach', 'quy trinh', 'bao hanh', 'bao duong', 'giay to', 'tin tuc']
const COMPARE_PHRASES = ['so sanh', 'khac nhau', 'doi chieu']
const PROMOTION_PHRASES = ['khuyen mai', 'uu dai', 'giam gia', 'promotion', 'ma giam']
const DETAIL_PHRASES = ['thong so', 'pin', 'dong co', 'toc do', 'quang duong', 'pham vi', 'cong suat', 'sac', 'gia', 'ton kho']
const CATALOG_PHRASES = ['tu van', 'goi y', 'tim', 'mau xe', 'ngan sach']
const NAVIGATION_PHRASES = ['link', 'url', 'duong dan', 'xem trang', 'mo trang', 'xem san pham', 'gui toi', 'truy cap']

function includesAny(value: string, phrases: string[]) {
  return phrases.some((phrase) => value.includes(phrase))
}

function normalizedMessage(message: string) {
  return normalizeProductSearchText(message)
}

/** Returns only an explicit intent from the current message. */
export function inferSalesAgentIntent(message: string): SalesAgentIntent | undefined {
  const normalized = normalizedMessage(message)
  if (!normalized || includesAny(normalized, STATIC_KNOWLEDGE_PHRASES)) return undefined
  if (includesAny(normalized, PROMOTION_PHRASES)) return 'PROMOTIONS'
  if (normalized.includes('phu kien')) return 'ACCESSORIES'
  if (includesAny(normalized, COMPARE_PHRASES)) return 'COMPARE_VEHICLES'
  if (includesAny(normalized, DETAIL_PHRASES)) return 'VEHICLE_DETAILS'
  if (includesAny(normalized, CATALOG_PHRASES)) return 'CATALOG_RECOMMENDATION'
  if (includesAny(normalized, NAVIGATION_PHRASES)) return 'NAVIGATION'
  return undefined
}

export function isSalesAgentStaticKnowledgeIntent(message: string) {
  return includesAny(normalizedMessage(message), STATIC_KNOWLEDGE_PHRASES)
}

export function salesAgentRequestsNavigation(message: string) {
  return includesAny(normalizedMessage(message), NAVIGATION_PHRASES)
}

function criteriaFromMessage(message: string): SalesAgentCriteria[] {
  const normalized = normalizedMessage(message)
  const criteria: SalesAgentCriteria[] = []
  if (normalized.includes('pin') || normalized.includes('dung luong')) criteria.push('battery_capacity_kwh')
  if (normalized.includes('toc do')) criteria.push('top_speed_kmh')
  if (normalized.includes('quang duong') || normalized.includes('pham vi')) criteria.push('range_km')
  if (normalized.includes('cong suat') || normalized.includes('dong co')) criteria.push('max_power_kw')
  if (normalized.includes('gia') || normalized.includes('ngan sach')) criteria.push('price')
  if (normalized.includes('ton kho') || normalized.includes('con hang') || normalized.includes('co san')) criteria.push('availability')
  return criteria
}

function productTypeFromMessage(message: string): SalesAgentProductType | undefined {
  const normalized = normalizedMessage(message)
  if (normalized.includes('phu kien')) return 'ACCESSORY'
  if (normalized.includes('xe may')) return 'BIKE'
  if (normalized.includes('o to')) return 'CAR'
  return undefined
}

function parseMoney(value: string, unit: string | undefined) {
  const amount = Number(value.replace(',', '.'))
  if (!Number.isFinite(amount)) return undefined
  if (unit === 'ty') return amount * 1_000_000_000
  if (unit === 'trieu') return amount * 1_000_000
  if (unit === 'nghin') return amount * 1_000
  return amount
}

function priceSlotsFromMessage(message: string): Pick<SalesAgentConversationSlots, 'minPrice' | 'maxPrice'> {
  const normalized = normalizedMessage(message)
  const match = normalized.match(/(?:duoi|toi da|tren|tu|ngan sach|tam gia)\s+(\d+(?:[.,]\d+)?)\s*(ty|trieu|nghin|vnd)?/)
  if (!match) return {}
  const price = parseMoney(match[1], match[2])
  if (price === undefined) return {}
  if (normalized.includes('duoi') || normalized.includes('toi da') || normalized.includes('ngan sach') || normalized.includes('tam gia')) return { maxPrice: price }
  return { minPrice: price }
}

function usageFromMessage(message: string) {
  const normalized = normalizedMessage(message)
  const usage = ['gia dinh', 'di lam', 'hang ngay', 'thanh pho', 'duong dai', 'di xa']
    .filter((term) => normalized.includes(term))
  return usage.length ? usage : undefined
}

function slotsFromMessage(message: string): SalesAgentConversationSlots {
  const criteria = criteriaFromMessage(message)
  const productType = productTypeFromMessage(message)
  const prices = priceSlotsFromMessage(message)
  const usage = usageFromMessage(message)
  return {
    ...(criteria.length ? { criteria } : {}),
    ...(productType ? { productType } : {}),
    ...prices,
    ...(usage ? { usage } : {}),
  }
}

function latestHistoryState(history: SalesAgentMessage[]) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index]
    if (item.role !== 'user') continue
    const activeIntent = inferSalesAgentIntent(item.content)
    if (activeIntent) return { activeIntent, slots: slotsFromMessage(item.content) }
  }
  return undefined
}

function mergeSlots(base: SalesAgentConversationSlots, current: SalesAgentConversationSlots) {
  return {
    ...base,
    ...current,
    ...(current.criteria?.length ? { criteria: current.criteria } : {}),
    ...(current.usage?.length ? { usage: current.usage } : {}),
  }
}

/**
 * Resolves compact deterministic state. Interaction state has highest
 * authority, followed by explicit current intent, previous state, and recent
 * user-led history.
 */
export function resolveSalesAgentConversationState(
  message: string,
  history: SalesAgentMessage[] = [],
  options: SalesAgentConversationResolutionOptions = {},
): SalesAgentConversationState {
  const explicitIntent = inferSalesAgentIntent(message)
  const historyState = latestHistoryState(history)
  const interactionState = options.interactionState
  const previousState = options.previousState
  const inherited = interactionState ?? previousState ?? historyState
  const activeIntent = interactionState?.activeIntent
    ?? explicitIntent
    ?? previousState?.activeIntent
    ?? historyState?.activeIntent
  const inheritedSlots = inherited && inherited.activeIntent === activeIntent ? inherited.slots : {}
  const currentSlots = slotsFromMessage(message)

  return {
    schemaVersion: '1.0',
    ...(activeIntent ? { activeIntent } : {}),
    slots: mergeSlots(inheritedSlots, currentSlots),
    ...(interactionState?.pendingInteractionId ? { pendingInteractionId: interactionState.pendingInteractionId } : {}),
    updatedAt: options.now ?? new Date().toISOString(),
  }
}

export function applySalesAgentVehicleSlots(
  state: SalesAgentConversationState,
  vehicleIds: string[],
  mode: 'replace' | 'append' = 'replace',
) {
  const max = state.activeIntent === 'COMPARE_VEHICLES' ? 3 : 1
  const uniqueIds = [...new Set(vehicleIds.filter(Boolean))]
  const merged = mode === 'append' ? [...(state.slots.vehicleIds ?? []), ...uniqueIds] : uniqueIds
  return {
    ...state,
    slots: {
      ...state.slots,
      vehicleIds: [...new Set(merged)].slice(-max),
    },
  }
}
