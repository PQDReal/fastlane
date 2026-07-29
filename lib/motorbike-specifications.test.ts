import motorbikes from '@/public/data/by_type/motorbikes.json'
import { describe, expect, it } from 'vitest'

describe('motorbike specifications', () => {
  it('keeps the same specification schema for all 18 motorbikes', () => {
    expect(motorbikes).toHaveLength(18)

    const canonicalKeys = Object.keys(motorbikes[0].specs)

    for (const motorbike of motorbikes) {
      expect(
        Object.keys(motorbike.specs),
        `${motorbike.name} must use the canonical specification schema`,
      ).toEqual(canonicalKeys)
    }
  })
})
