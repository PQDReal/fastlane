import { describe, expect, it } from 'vitest'

import { CURRENT_SOURCE_REVIEW_BLOCKS, sourceReviewBlockFor } from './source-review'

describe('catalog official-source review blocks', () => {
  it('keeps every block scoped to one exact immutable source snapshot', () => {
    expect(new Set(CURRENT_SOURCE_REVIEW_BLOCKS.map((block) => block.productId)).size).toBe(CURRENT_SOURCE_REVIEW_BLOCKS.length)
    for (const block of CURRENT_SOURCE_REVIEW_BLOCKS) {
      expect(block.sourceHash).toMatch(/^[a-f0-9]{64}$/)
      expect(block.evidenceUrls.length).toBeGreaterThan(0)
      expect(block.evidenceUrls.every((url) => /^https:\/\/(?:shop\.|static-cms-prod\.)?vinfastauto\.com\//.test(url))).toBe(true)
    }
  })

  it('does not carry a stale review block onto a changed payload', () => {
    const block = CURRENT_SOURCE_REVIEW_BLOCKS[0]
    expect(sourceReviewBlockFor({
      id: block.productId,
      name: block.productName,
      productType: 'MOTORBIKE',
      specifications: { corrected: true },
    })).toBeNull()
  })
})
