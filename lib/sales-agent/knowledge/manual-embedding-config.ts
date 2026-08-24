export const MANUAL_EMBEDDING_MODEL = 'text-embedding-3-small' as const
export const MANUAL_EMBEDDING_DIMENSIONS = 512

export const MANUAL_EMBEDDING_PROVIDER_OPTIONS = {
  openai: {
    dimensions: MANUAL_EMBEDDING_DIMENSIONS,
  },
}

export function assertManualEmbeddingDimensions(embedding: readonly number[]): void {
  if (embedding.length !== MANUAL_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Manual embedding phải có ${MANUAL_EMBEDDING_DIMENSIONS} chiều, nhận được ${embedding.length}.`,
    )
  }
}
