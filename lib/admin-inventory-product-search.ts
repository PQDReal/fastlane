import { normalizeInventoryText } from './admin-inventory-filter'

export type InventoryProductSearchResult = {
  label: string
  score: number
  highlightRanges: Array<[number, number]>
}

function normalizedWords(value: unknown) {
  return normalizeInventoryText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function compact(value: unknown) {
  return normalizedWords(value).replace(/\s+/g, '')
}

function productSearchScore(label: string, query: string) {
  const normalizedLabel = normalizedWords(label)
  const normalizedQuery = normalizedWords(query)
  const compactLabel = compact(label)
  const compactQuery = compact(query)
  if (!compactQuery) return 0
  if (compactLabel === compactQuery) return 0
  if (normalizedLabel.startsWith(normalizedQuery)) return 1
  if (compactLabel.startsWith(compactQuery)) return 2
  if (normalizedLabel.split(' ').some((word) => word.startsWith(normalizedQuery))) return 3
  if (normalizedLabel.includes(normalizedQuery)) return 4
  if (compactLabel.includes(compactQuery)) return 5
  const queryTokens = normalizedQuery.split(' ').filter(Boolean)
  return queryTokens.every((token) => normalizedLabel.includes(token)) ? 6 : null
}

function compactProjection(label: string) {
  let value = ''
  const sourceRanges: Array<[number, number]> = []
  let sourceOffset = 0

  for (const character of label) {
    const sourceStart = sourceOffset
    sourceOffset += character.length
    const normalizedCharacter = normalizeInventoryText(character).replace(/[^a-z0-9]/g, '')
    for (const normalizedUnit of normalizedCharacter) {
      value += normalizedUnit
      sourceRanges.push([sourceStart, sourceOffset])
    }
  }

  return { value, sourceRanges }
}

function mergeRanges(ranges: Array<[number, number]>) {
  return ranges
    .sort((left, right) => left[0] - right[0])
    .reduce<Array<[number, number]>>((merged, range) => {
      const previous = merged.at(-1)
      if (!previous || range[0] > previous[1]) {
        merged.push([...range])
      } else {
        previous[1] = Math.max(previous[1], range[1])
      }
      return merged
    }, [])
}

export function inventoryProductHighlightRanges(label: string, query: string) {
  const projection = compactProjection(label)
  const queryParts = normalizedWords(query).split(' ').map(compact).filter(Boolean)
  const fullQuery = compact(query)
  const matchedRanges: Array<[number, number]> = []

  const addMatch = (needle: string) => {
    const matchIndex = projection.value.indexOf(needle)
    if (matchIndex < 0) return false
    const first = projection.sourceRanges[matchIndex]
    const last = projection.sourceRanges[matchIndex + needle.length - 1]
    if (first && last) matchedRanges.push([first[0], last[1]])
    return true
  }

  if (!fullQuery || addMatch(fullQuery)) return mergeRanges(matchedRanges)
  queryParts.forEach(addMatch)
  return mergeRanges(matchedRanges)
}

export function searchInventoryProducts(options: string[], query: string): InventoryProductSearchResult[] {
  return options.flatMap((label) => {
    const score = productSearchScore(label, query)
    if (score === null) return []
    return [{
      label,
      score,
      highlightRanges: inventoryProductHighlightRanges(label, query),
    }]
  }).sort((left, right) => left.score - right.score || left.label.localeCompare(right.label, 'vi'))
}
