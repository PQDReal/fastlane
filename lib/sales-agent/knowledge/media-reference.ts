export function knowledgeMediaReference(position: number): string {
  return `media:${position}`
}

export function knowledgeMediaMarker(reference: string): string {
  return `[${reference}]`
}

export function knowledgeMediaPosition(reference: string): number | null {
  const match = /^media:(\d+)$/i.exec(reference.trim())
  if (!match) return null
  const position = Number(match[1])
  return Number.isSafeInteger(position) && position > 0 ? position : null
}
