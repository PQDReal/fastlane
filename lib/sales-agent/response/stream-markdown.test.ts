import { describe, expect, it } from 'vitest'

import {
  GROUNDED_STREAM_CHUNK_SIZE,
  chunkGroundedMarkdown,
} from './stream-markdown'

describe('grounded markdown streaming', () => {
  it('reconstructs the exact grounded answer from small deltas', () => {
    const markdown = 'Cổng sạc nằm ở phía trước xe.\n\n[Xem hướng dẫn](/user-manual/VF%208_2024/1152109)'
    const chunks = chunkGroundedMarkdown(markdown)

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join('')).toBe(markdown)
    expect(chunks.every((chunk) => Array.from(chunk).length <= GROUNDED_STREAM_CHUNK_SIZE)).toBe(true)
  })

  it('does not split a Unicode surrogate pair between deltas', () => {
    expect(chunkGroundedMarkdown('A🚗B', 2)).toEqual(['A🚗', 'B'])
  })

  it('rejects invalid chunk sizes', () => {
    expect(() => chunkGroundedMarkdown('answer', 0)).toThrow(RangeError)
  })
})
