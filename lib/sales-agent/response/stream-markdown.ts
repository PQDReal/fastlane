export const GROUNDED_STREAM_CHUNK_SIZE = 6

export function chunkGroundedMarkdown(
  markdown: string,
  chunkSize = GROUNDED_STREAM_CHUNK_SIZE,
): string[] {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new RangeError('chunkSize must be a positive integer')
  }

  const characters = Array.from(markdown)
  const chunks: string[] = []

  for (let index = 0; index < characters.length; index += chunkSize) {
    chunks.push(characters.slice(index, index + chunkSize).join(''))
  }

  return chunks
}
