export type DiagramLabel = {
  marker: string
  description: string
}

const PARENTHESIZED_MARKER = /\(([0-9]{1,3}|[A-Za-z])\)/g
const NON_DESCRIPTION_SEGMENTS = /^(?:đến|tới|đến số|tới số|bao gồm|gồm|lần lượt|từ)?\s*[:;,.-]*$/iu

function cleanDescription(value: string) {
  return value
    .replace(/^[\s:;,.–—-]+/u, '')
    .replace(/[\s;,]+$/u, '')
    .trim()
}

/**
 * Extracts only labels explicitly present in a visual summary. It intentionally
 * keeps the complete source description instead of guessing component/location
 * fields that the source did not structure.
 */
export function extractDiagramLabels(summary: string): DiagramLabel[] {
  const matches = Array.from(summary.matchAll(PARENTHESIZED_MARKER))
  if (matches.length === 0) return []

  const candidates = matches.flatMap((match, index) => {
    const marker = match[1]
    const start = (match.index ?? 0) + match[0].length
    const end = matches[index + 1]?.index ?? summary.length
    const description = cleanDescription(summary.slice(start, end))

    if (!description || NON_DESCRIPTION_SEGMENTS.test(description)) return []
    return [{ marker, description, sourceIndex: match.index ?? 0 }]
  })

  const bestByMarker = new Map<string, (typeof candidates)[number]>()
  for (const candidate of candidates) {
    const current = bestByMarker.get(candidate.marker)
    if (!current || candidate.description.length > current.description.length) {
      bestByMarker.set(candidate.marker, candidate)
    }
  }

  return Array.from(bestByMarker.values())
    .sort((left, right) => {
      const leftNumber = Number(left.marker)
      const rightNumber = Number(right.marker)
      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber
      return left.sourceIndex - right.sourceIndex
    })
    .slice(0, 30)
    .map(({ marker, description }) => ({ marker, description }))
}
