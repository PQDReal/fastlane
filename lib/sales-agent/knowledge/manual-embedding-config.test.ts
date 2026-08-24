import { describe, expect, it } from 'vitest'

import {
  assertManualEmbeddingDimensions,
  MANUAL_EMBEDDING_DIMENSIONS,
  MANUAL_EMBEDDING_PROVIDER_OPTIONS,
} from './manual-embedding-config'

describe('manual embedding configuration', () => {
  it('keeps query and stored vectors on the database dimension', () => {
    expect(MANUAL_EMBEDDING_DIMENSIONS).toBe(512)
    expect(MANUAL_EMBEDDING_PROVIDER_OPTIONS.openai.dimensions).toBe(512)
    expect(() => assertManualEmbeddingDimensions(Array(512).fill(0))).not.toThrow()
  })

  it('fails fast before sending a vector with the wrong dimension to Supabase', () => {
    expect(() => assertManualEmbeddingDimensions(Array(1536).fill(0))).toThrow(
      'Manual embedding phải có 512 chiều, nhận được 1536.',
    )
  })
})
