import { normalizeProductSearchText } from '@/lib/catalog/search'

export type SalesAgentProductTypeHint = 'CAR' | 'BIKE' | 'ACCESSORY'

export type SalesAgentProductTypeClassification = {
  type: SalesAgentProductTypeHint | null
  reason: 'CATEGORY_ALIAS' | 'NONE'
  normalizedQuery: string
  nameQuery: string
}

const CATEGORY_ALIASES: Array<{
  type: SalesAgentProductTypeHint
  aliases: string[]
}> = [
  {
    type: 'ACCESSORY',
    aliases: ['phu kien', 'phu tung', 'do cho xe'],
  },
  {
    type: 'BIKE',
    aliases: ['xe may dien', 'xe may', 'scooter', 'motorbike', 'motor bike', 'xe tay ga'],
  },
  {
    type: 'CAR',
    aliases: ['o to dien', 'o to', 'xe hoi', 'suv', 'sedan', 'crossover'],
  },
]

function containsAlias(query: string, alias: string) {
  return ` ${query} `.includes(` ${alias} `)
}

function removeAliases(query: string, type: SalesAgentProductTypeHint | null) {
  if (!type) return query
  const aliases = CATEGORY_ALIASES.find((entry) => entry.type === type)?.aliases ?? []
  return aliases.reduce((value, alias) => value.replaceAll(alias, ' '), query).replace(/\s+/g, ' ').trim()
}

/**
 * Classifies only explicit category language. Product names such as Evo or
 * VF 8 are deliberately left to the catalog resolver instead of being
 * guessed from a growing list of model aliases.
 */
export function classifySalesAgentProductType(value: string | null | undefined): SalesAgentProductTypeClassification {
  const normalizedQuery = normalizeProductSearchText(value ?? '')
  const match = CATEGORY_ALIASES.find((entry) => entry.aliases.some((alias) => containsAlias(normalizedQuery, alias)))
  const type = match?.type ?? null
  return {
    type,
    reason: type ? 'CATEGORY_ALIAS' : 'NONE',
    normalizedQuery,
    nameQuery: removeAliases(normalizedQuery, type),
  }
}

