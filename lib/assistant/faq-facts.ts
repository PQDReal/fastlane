import type { CanonicalAssistantFact, CatalogFactReadMode } from '@/lib/catalog-intelligence/assistant-facts'
import { normalizeProductSearchText } from '@/lib/catalog/search'

export type AssistantFaqTopic = {
  canonicalKey: 'range_km' | 'max_power_kw' | 'top_speed_kmh' | 'battery_capacity_kwh' | 'battery_type'
  queryPattern: RegExp
  legacyFactPattern: RegExp
  label: string
  cutover: 'READY' | 'HOLD'
  tolerance: number
}

export const ASSISTANT_FAQ_TOPICS: readonly AssistantFaqTopic[] = [
  {
    canonicalKey: 'range_km',
    queryPattern: /(di duoc|bao xa|pham vi|quang duong)/,
    legacyFactPattern: /(distance|range|quang.duong|pham.vi)/i,
    label: 'phạm vi di chuyển',
    cutover: 'HOLD',
    tolerance: 0.5,
  },
  {
    canonicalKey: 'max_power_kw',
    queryPattern: /(cong suat)/,
    legacyFactPattern: /(maxpower|max_power|powertrain|cong.suat)/i,
    label: 'công suất',
    cutover: 'HOLD',
    tolerance: 0.01,
  },
  {
    canonicalKey: 'top_speed_kmh',
    queryPattern: /(toc do)/,
    legacyFactPattern: /(topspeed|speed|toc.do)/i,
    label: 'tốc độ',
    cutover: 'READY',
    tolerance: 0.5,
  },
  {
    canonicalKey: 'battery_capacity_kwh',
    queryPattern: /(dung luong(?: pin)?|pin (?:co )?bao nhieu|pin.*kwh|bao nhieu.*pin)/,
    legacyFactPattern: /(battery.?capacity|capacity|dung.?luong)/i,
    label: 'dung lượng pin',
    cutover: 'HOLD',
    tolerance: 0.01,
  },
  {
    canonicalKey: 'battery_type',
    queryPattern: /(loai pin|pin gi|dung pin|pin nao)/,
    legacyFactPattern: /(battery.?type|loai.?pin|loai.?ac.?quy)/i,
    label: 'loại pin',
    cutover: 'HOLD',
    tolerance: 0,
  },
]

export type AssistantFaqFactResolution = {
  value: string | null
  source: 'legacy' | 'canonical' | 'none'
  shadowStatus: 'NOT_ELIGIBLE' | 'UNAVAILABLE' | 'MATCH' | 'VALUE_MISMATCH' | 'LEGACY_ONLY' | 'CANONICAL_ONLY' | 'CONTEXT_SPLIT'
}

function firstNumber(value: string) {
  const match = value.match(/[0-9]+(?:[.,][0-9]+)?/)
  if (!match) return null
  const parsed = Number(match[0].replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function equivalentFact(topic: AssistantFaqTopic, legacyValue: string, canonical: CanonicalAssistantFact) {
  const legacyNumber = firstNumber(legacyValue)
  if (legacyNumber !== null && canonical.numericValue !== null) {
    return Math.abs(legacyNumber - canonical.numericValue) <= topic.tolerance
  }
  return normalizeProductSearchText(legacyValue) === normalizeProductSearchText(canonical.displayValue)
}

export function findAssistantFaqTopic(query: string) {
  return ASSISTANT_FAQ_TOPICS.find((topic) => topic.queryPattern.test(query)) ?? null
}

export function findLegacyAssistantFaqFact(
  topic: AssistantFaqTopic,
  facts: Record<string, string> | undefined,
) {
  return Object.entries(facts ?? {}).find(([key]) => (
    topic.legacyFactPattern.test(normalizeProductSearchText(key))
  ))?.[1] ?? null
}

export function resolveAssistantFaqFact(input: {
  mode: CatalogFactReadMode
  topic: AssistantFaqTopic
  legacyValue: string | null
  canonicalReadStatus: 'available' | 'unavailable'
  canonicalFacts: readonly CanonicalAssistantFact[]
}): AssistantFaqFactResolution {
  const { mode, topic, legacyValue, canonicalReadStatus } = input
  if (mode === 'legacy' || topic.cutover !== 'READY') {
    return {
      value: legacyValue,
      source: legacyValue === null ? 'none' : 'legacy',
      shadowStatus: 'NOT_ELIGIBLE',
    }
  }
  if (canonicalReadStatus === 'unavailable') {
    return {
      value: legacyValue,
      source: legacyValue === null ? 'none' : 'legacy',
      shadowStatus: 'UNAVAILABLE',
    }
  }

  const canonicalFacts = input.canonicalFacts.filter((fact) => fact.canonicalKey === topic.canonicalKey)
  const shadowStatus = canonicalFacts.length > 1
    ? 'CONTEXT_SPLIT'
    : canonicalFacts.length === 0
      ? 'LEGACY_ONLY'
      : legacyValue === null
        ? 'CANONICAL_ONLY'
        : equivalentFact(topic, legacyValue, canonicalFacts[0])
          ? 'MATCH'
          : 'VALUE_MISMATCH'

  if (mode === 'shadow') {
    return {
      value: legacyValue,
      source: legacyValue === null ? 'none' : 'legacy',
      shadowStatus,
    }
  }
  if (canonicalFacts.length === 1) {
    return { value: canonicalFacts[0].displayValue, source: 'canonical', shadowStatus }
  }
  return { value: null, source: 'none', shadowStatus }
}
