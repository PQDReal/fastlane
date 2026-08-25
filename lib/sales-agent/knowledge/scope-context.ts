import 'server-only'

import { normalizeProductSearchText } from '@/lib/catalog/search'
import { catalogCacheEngine } from '../cache/catalog-cache'
import { knowledgeScopeCatalogEngine } from './scope-catalog'

export type KnowledgeScopeSource = 'CURRENT_USER' | 'USER_HISTORY' | 'SIGNED_INTERACTION' | 'CATALOG'

export type KnowledgeScopeBinding = {
  bindingId?: string
  vehicleModel?: string
  modelYear?: number
  categories?: string[]
  isBindingAmbiguous?: boolean
  modelYearPolicy?: 'EXPLICIT' | 'ONLY_AVAILABLE' | 'LATEST'
  sources?: {
    vehicleModel?: KnowledgeScopeSource
    modelYear?: KnowledgeScopeSource
  }
  sourceTexts?: string[]
}

export type KnowledgeScopeContext = {
  binding: KnowledgeScopeBinding | null
  candidateModels: string[]
  candidateYears: number[]
}

type ScopeText = {
  source: KnowledgeScopeSource
  content: string
}

const YEAR_PATTERN = /\b(20\d{2})\b/g

type VehicleAliasEntry = {
  canonical: string
  alias: string
  normalizedAlias: string
}

function getKnownVehicleAliases(): VehicleAliasEntry[] {
  const productSnapshot = catalogCacheEngine.getSnapshot()
  const knowledgeSnapshot = knowledgeScopeCatalogEngine.getSnapshot()
  const aliasesByNormalizedValue = new Map<string, VehicleAliasEntry>()
  const knowledgeModels = [...new Set(
    knowledgeSnapshot.entries.flatMap((entry) => entry.vehicleModel ? [entry.vehicleModel.trim()] : []),
  )]
  const knowledgeModelByNormalizedName = new Map(
    knowledgeModels.map((model) => [normalizeProductSearchText(model), model]),
  )
  const baseKnowledgeModelByVfCode = new Map<string, string>()

  for (const model of knowledgeModels) {
    const normalizedModel = normalizeProductSearchText(model)
    const baseMatch = normalizedModel.match(/^vf\s*(e34|\d+)$/i)
    if (baseMatch) {
      const code = baseMatch[1].toLowerCase() === 'e34' ? 'e34' : baseMatch[1]
      baseKnowledgeModelByVfCode.set(code, model)
    }
  }

  const registerAlias = (canonical: string, alias: string) => {
    const normalizedAlias = normalizeProductSearchText(alias)
    if (normalizedAlias.length < 2 || aliasesByNormalizedValue.has(normalizedAlias)) return
    aliasesByNormalizedValue.set(normalizedAlias, { canonical, alias, normalizedAlias })
  }

  const registerVfAliases = (
    canonical: string,
    normalizedName: string,
    includeBaseAliases: boolean,
  ) => {
    const vfMatch = normalizedName.match(/^vf\s*(e34|\d+)(.*)$/i)
    if (!vfMatch) return

    const code = vfMatch[1].toLowerCase() === 'e34' ? 'e34' : vfMatch[1]
    const rest = vfMatch[2] ? ` ${vfMatch[2].trim()}` : ''
    registerAlias(canonical, `vf ${code}${rest}`.trim())
    registerAlias(canonical, `vf${code}${rest}`.trim())
    registerAlias(canonical, `vinfast vf ${code}${rest}`.trim())
    registerAlias(canonical, `vinfast vf${code}${rest}`.trim())

    if (includeBaseAliases) {
      registerAlias(canonical, `vf ${code}`)
      registerAlias(canonical, `vf${code}`)
      registerAlias(canonical, `vinfast vf ${code}`)
      registerAlias(canonical, `vinfast vf${code}`)
    }

    if (code === 'e34') {
      registerAlias(canonical, `vf 34${rest}`.trim())
      registerAlias(canonical, `vf34${rest}`.trim())
      if (includeBaseAliases) {
        registerAlias(canonical, 'vf 34')
        registerAlias(canonical, 'vf34')
      }
    }
  }

  // The knowledge catalog is authoritative for technical scope. In particular,
  // manuals are indexed under "VF 5" even when the commercial catalog exposes
  // a "VF 5 Plus" product or variant.
  for (const model of knowledgeModels) {
    const normalizedModel = normalizeProductSearchText(model)
    registerAlias(model, normalizedModel)
    registerAlias(model, `vinfast ${normalizedModel}`)
    registerVfAliases(model, normalizedModel, baseKnowledgeModelByVfCode.has(
      normalizedModel.match(/^vf\s*(e34|\d+)$/i)?.[1]?.toLowerCase() || '',
    ))
  }

  for (const product of productSnapshot.products) {
    if (product.productType === 'ACCESSORY') continue
    const cleanName = product.name.replace(/^vinfast\s+/iu, '').trim() || product.name.trim()
    const normalizedClean = normalizeProductSearchText(cleanName)
    const vfMatch = normalizedClean.match(/^vf\s*(e34|\d+)(.*)$/i)
    const vfCode = vfMatch?.[1]?.toLowerCase()
    const canonical = knowledgeModelByNormalizedName.get(normalizedClean)
      ?? (vfCode ? baseKnowledgeModelByVfCode.get(vfCode) : undefined)
      ?? cleanName

    registerAlias(canonical, normalizedClean)
    registerAlias(canonical, product.name)
    if (product.slug) registerAlias(canonical, product.slug)
    registerVfAliases(canonical, normalizedClean, Boolean(vfCode && baseKnowledgeModelByVfCode.has(vfCode)))

    const suffixMatch = normalizedClean.match(/^([a-z0-9]+)\s+s$/i)
    if (suffixMatch && suffixMatch[1].length >= 3) {
      registerAlias(canonical, suffixMatch[1])
    }
  }

  // Sort by alias length descending so longer aliases match first (e.g. "VF 5 Plus" before "VF 5")
  return [...aliasesByNormalizedValue.values()]
    .sort((a, b) => b.normalizedAlias.length - a.normalizedAlias.length)
}

function extractModels(text: string): string[] {
  const normalized = normalizeProductSearchText(text)
  const padded = ` ${normalized} `
  const aliases = getKnownVehicleAliases()

  type Match = { canonical: string; start: number; end: number; length: number }
  const matches: Match[] = []

  for (const item of aliases) {
    const searchTarget = ` ${item.normalizedAlias} `
    let startIndex = 0
    while (startIndex < padded.length) {
      const found = padded.indexOf(searchTarget, startIndex)
      if (found < 0) break
      matches.push({
        canonical: item.canonical,
        start: found,
        end: found + item.normalizedAlias.length + 2,
        length: item.normalizedAlias.length,
      })
      startIndex = found + 1
    }
  }

  // Resolve overlaps: keep the longest match at each text position
  matches.sort((a, b) => b.length - a.length)
  const selected: Match[] = []

  for (const match of matches) {
    const overlaps = selected.some((s) => match.start < s.end && match.end > s.start)
    if (!overlaps) {
      selected.push(match)
    }
  }

  // Preserve utterance order and eliminate duplicate canonical names
  selected.sort((a, b) => a.start - b.start)
  const result: string[] = []
  const seenCanonical = new Set<string>()

  for (const match of selected) {
    if (!seenCanonical.has(match.canonical)) {
      seenCanonical.add(match.canonical)
      result.push(match.canonical)
    }
  }

  return result
}

function extractYears(text: string): number[] {
  const years = new Set<number>()
  for (const match of normalizeProductSearchText(text).matchAll(YEAR_PATTERN)) {
    const year = Number(match[1])
    if (year >= 2000 && year <= 2100) years.add(year)
  }
  return [...years].sort((left, right) => left - right)
}

function latestUnambiguousScopeText(texts: ScopeText[]): ScopeText | null {
  for (let index = texts.length - 1; index >= 0; index -= 1) {
    const text = texts[index]
    const models = extractModels(text.content)
    if (models.length === 1) return text
    if (models.length > 1) return null
  }
  return null
}

function buildBinding(
  model: string | undefined,
  modelYear: number | undefined,
  sources: KnowledgeScopeBinding['sources'],
  sourceTexts: string[],
): KnowledgeScopeBinding | null {
  if (!model && !modelYear) return null
  const normalized = [model, modelYear].filter(Boolean).join('|')
  return {
    bindingId: `scope-${normalizeProductSearchText(normalized).replace(/\s+/g, '-')}`,
    ...(model ? { vehicleModel: model } : {}),
    ...(modelYear ? { modelYear } : {}),
    sources,
    sourceTexts: [...new Set(sourceTexts)].slice(0, 3),
  }
}

/**
 * Builds a trusted knowledge scope from user-authored text only.
 *
 * The model may send vehicleModel/modelYear in a tool call for compatibility,
 * but those values are intentionally not inspected here. This context is the
 * only scope that the retrieval adapter is allowed to turn into hard filters.
 */
export function buildKnowledgeScopeContext(
  currentUserText: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
): KnowledgeScopeContext {
  const current: ScopeText = { source: 'CURRENT_USER', content: currentUserText }
  const currentModels = extractModels(current.content)
  const currentYears = extractYears(current.content)

  // Multiple models in the current request are intentionally left unbound.
  // Retrieval must be allowed to surface structured ambiguity instead of
  // silently picking the first model.
  if (currentModels.length > 1) {
    return {
      binding: null,
      candidateModels: currentModels,
      candidateYears: currentYears,
    }
  }

  const userHistory: ScopeText[] = history
    .filter((message) => message.role === 'user')
    .map((message) => ({ source: 'USER_HISTORY' as const, content: message.content }))
  const latestHistoryScope = currentModels.length === 0 ? latestUnambiguousScopeText(userHistory) : null
  const historyModels = latestHistoryScope ? extractModels(latestHistoryScope.content) : []
  const model = currentModels[0] || historyModels[0]
  const modelSource = currentModels.length > 0 ? 'CURRENT_USER' : historyModels.length > 0 ? 'USER_HISTORY' : undefined

  const modelYear = currentYears.length === 1
    ? currentYears[0]
    : currentYears.length > 1
      ? undefined
      : latestHistoryScope
        ? (extractYears(latestHistoryScope.content).length === 1 ? extractYears(latestHistoryScope.content)[0] : undefined)
        : undefined
  const yearSource = currentYears.length === 1
    ? 'CURRENT_USER'
    : !currentYears.length && latestHistoryScope && extractYears(latestHistoryScope.content).length === 1
      ? 'USER_HISTORY'
      : undefined

  const binding = buildBinding(
    model,
    modelYear,
    {
      ...(modelSource ? { vehicleModel: modelSource } : {}),
      ...(yearSource ? { modelYear: yearSource } : {}),
    },
    [currentUserText, ...(latestHistoryScope ? [latestHistoryScope.content] : [])],
  )

  return {
    binding,
    candidateModels: model ? [model] : [],
    candidateYears: modelYear ? [modelYear] : currentYears,
  }
}
