import { describe, expect, it } from 'vitest'

import type { CanonicalAssistantFact } from '@/lib/catalog-intelligence/assistant-facts'
import {
  ASSISTANT_FAQ_TOPICS,
  findAssistantFaqTopic,
  findLegacyAssistantFaqFact,
  resolveAssistantFaqFact,
} from './faq-facts'

const speedTopic = ASSISTANT_FAQ_TOPICS.find((topic) => topic.canonicalKey === 'top_speed_kmh')!
const rangeTopic = ASSISTANT_FAQ_TOPICS.find((topic) => topic.canonicalKey === 'range_km')!
const canonicalSpeed: CanonicalAssistantFact = {
  productId: 'product-1',
  canonicalKey: 'top_speed_kmh',
  displayValue: '70 km/h',
  numericValue: 70,
  canonicalUnit: 'km/h',
  contextKey: 'default',
}

describe('assistant FAQ fact cut-over', () => {
  it('maps deterministic FAQ wording to canonical keys', () => {
    expect(findAssistantFaqTopic('vf 9 toc do toi da')?.canonicalKey).toBe('top_speed_kmh')
    expect(findAssistantFaqTopic('feliz dung luong pin')?.canonicalKey).toBe('battery_capacity_kwh')
    expect(findAssistantFaqTopic('feliz co pin bao nhieu')?.canonicalKey).toBe('battery_capacity_kwh')
    expect(findAssistantFaqTopic('feliz dung pin gi')?.canonicalKey).toBe('battery_type')
    expect(findAssistantFaqTopic('vf 8 bao xa')?.canonicalKey).toBe('range_km')
  })

  it('does not confuse battery type with battery capacity', () => {
    const capacityTopic = ASSISTANT_FAQ_TOPICS.find((topic) => topic.canonicalKey === 'battery_capacity_kwh')!
    expect(findLegacyAssistantFaqFact(capacityTopic, {
      'specs.Loại pin/ắc quy': 'LFP',
      'specs.Dung lượng pin/ắc quy': '1.5 kWh',
    })).toBe('1.5 kWh')
  })

  it('keeps legacy path matching isolated from the canonical key', () => {
    expect(findLegacyAssistantFaqFact(speedTopic, {
      'specs.performance.topSpeed': '70 km/h',
      'specs.range': '198 km',
    })).toBe('70 km/h')
  })

  it('answers with legacy data and records parity in shadow mode', () => {
    expect(resolveAssistantFaqFact({
      mode: 'shadow',
      topic: speedTopic,
      legacyValue: '70 km/h',
      canonicalReadStatus: 'available',
      canonicalFacts: [canonicalSpeed],
    })).toEqual({ value: '70 km/h', source: 'legacy', shadowStatus: 'MATCH' })
  })

  it('uses the audited canonical fact in canonical mode', () => {
    expect(resolveAssistantFaqFact({
      mode: 'canonical',
      topic: speedTopic,
      legacyValue: '69 km/h',
      canonicalReadStatus: 'available',
      canonicalFacts: [canonicalSpeed],
    })).toEqual({ value: '70 km/h', source: 'canonical', shadowStatus: 'VALUE_MISMATCH' })
  })

  it('does not cut over a key held by the shadow audit', () => {
    expect(resolveAssistantFaqFact({
      mode: 'canonical',
      topic: rangeTopic,
      legacyValue: '198 km',
      canonicalReadStatus: 'available',
      canonicalFacts: [{ ...canonicalSpeed, canonicalKey: 'range_km', displayValue: '200 km', numericValue: 200 }],
    })).toEqual({ value: '198 km', source: 'legacy', shadowStatus: 'NOT_ELIGIBLE' })
  })

  it('falls back only when the canonical store is unavailable', () => {
    expect(resolveAssistantFaqFact({
      mode: 'canonical',
      topic: speedTopic,
      legacyValue: '70 km/h',
      canonicalReadStatus: 'unavailable',
      canonicalFacts: [],
    })).toEqual({ value: '70 km/h', source: 'legacy', shadowStatus: 'UNAVAILABLE' })

    expect(resolveAssistantFaqFact({
      mode: 'canonical',
      topic: speedTopic,
      legacyValue: '70 km/h',
      canonicalReadStatus: 'available',
      canonicalFacts: [],
    })).toEqual({ value: null, source: 'none', shadowStatus: 'LEGACY_ONLY' })
  })

  it('never collapses unexpected contextual facts to the first value', () => {
    expect(resolveAssistantFaqFact({
      mode: 'canonical',
      topic: speedTopic,
      legacyValue: '70 km/h',
      canonicalReadStatus: 'available',
      canonicalFacts: [canonicalSpeed, { ...canonicalSpeed, contextKey: 'eco', displayValue: '50 km/h', numericValue: 50 }],
    })).toEqual({ value: null, source: 'none', shadowStatus: 'CONTEXT_SPLIT' })
  })
})
