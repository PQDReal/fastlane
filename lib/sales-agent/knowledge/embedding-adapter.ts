export interface EmbeddingAdapterConfig {
  apiKey?: string
  model?: string
  dimensions?: number
  maxBatchSize?: number
  timeoutMs?: number
  maxRetries?: number
  allowMock?: boolean
}

export interface EmbeddingResult {
  index: number
  embedding: number[]
  tokenCount?: number
}

export interface BatchEmbeddingResponse {
  embeddings: EmbeddingResult[]
  totalTokens: number
  model: string
  dimensions: number
}

export class OpenAIEmbeddingAdapter {
  private apiKey: string
  private model: string
  private dimensions: number
  private maxBatchSize: number
  private timeoutMs: number
  private maxRetries: number
  private allowMock: boolean

  constructor(config: EmbeddingAdapterConfig = {}) {
    this.apiKey = (config.apiKey || process.env.OPENAI_API_KEY || '').trim()
    this.model = (config.model || 'text-embedding-3-small').trim()
    this.dimensions = config.dimensions ?? 1536
    this.maxBatchSize = config.maxBatchSize ?? 64
    this.timeoutMs = config.timeoutMs ?? 15000
    this.maxRetries = config.maxRetries ?? 3
    this.allowMock = config.allowMock ?? false

    if (this.model !== 'text-embedding-3-small') {
      throw new Error(`Invalid embedding model: expected text-embedding-3-small, got ${this.model}`)
    }

    if (this.dimensions !== 1536) {
      throw new Error(`Invalid dimensions: expected 1536 for text-embedding-3-small, got ${this.dimensions}`)
    }

    if (!Number.isInteger(this.maxBatchSize) || this.maxBatchSize < 1 || this.maxBatchSize > 64) {
      throw new Error(`Invalid maxBatchSize: expected an integer between 1 and 64, got ${this.maxBatchSize}`)
    }

    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0 || !Number.isInteger(this.maxRetries) || this.maxRetries < 1) {
      throw new Error('Invalid embedding timeout/retry configuration')
    }

    if (!this.apiKey && !this.allowMock) {
      throw new Error('OPENAI_API_KEY is required for OpenAIEmbeddingAdapter (Fail-Closed D-019-011)')
    }
  }

  /**
   * Tạo embeddings theo từng batch có kiểm soát rate limit và retry
   */
  async generateEmbeddings(texts: string[]): Promise<BatchEmbeddingResponse> {
    if (!texts || texts.length === 0) {
      return {
        embeddings: [],
        totalTokens: 0,
        model: this.model,
        dimensions: this.dimensions,
      }
    }

    // Chỉ cho phép mock nếu allowMock được bật tường minh (cho unit test độc lập)
    if (this.allowMock) {
      return this.generateDeterministicMockEmbeddings(texts)
    }

    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is missing. Cannot generate embeddings.')
    }

    const allResults: EmbeddingResult[] = []
    let totalTokensAccumulated = 0

    // Phân trang batch <= 64 items
    for (let i = 0; i < texts.length; i += this.maxBatchSize) {
      const batch = texts.slice(i, i + this.maxBatchSize)
      const batchResponse = await this.callOpenAIWithRetry(batch, i)
      allResults.push(...batchResponse.embeddings)
      totalTokensAccumulated += batchResponse.totalTokens
    }

    return {
      embeddings: allResults,
      totalTokens: totalTokensAccumulated,
      model: this.model,
      dimensions: this.dimensions,
    }
  }

  private async callOpenAIWithRetry(
    batch: string[],
    offsetIndex: number
  ): Promise<{ embeddings: EmbeddingResult[]; totalTokens: number }> {
    let attempt = 0
    let lastError: Error | null = null

    while (attempt < this.maxRetries) {
      attempt++
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs)

        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            input: batch,
            model: this.model,
            dimensions: this.dimensions,
          }),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          const errBody = await response.text()
          throw new Error(`OpenAI API error (${response.status}): ${errBody}`)
        }

        const data = await response.json()
        if (!Array.isArray(data?.data) || data.data.length !== batch.length) {
          throw new Error(`OpenAI API returned ${data?.data?.length ?? 0} embeddings for ${batch.length} inputs`)
        }

        const embeddings: EmbeddingResult[] = data.data.map((item: any, idx: number) => {
          if (!Array.isArray(item?.embedding) || item.embedding.length !== this.dimensions) {
            throw new Error(`OpenAI API returned invalid embedding dimensions at batch index ${idx}`)
          }

          return {
            index: offsetIndex + idx,
            embedding: item.embedding,
          }
        })

        return {
          embeddings,
          totalTokens: data.usage?.total_tokens || 0,
        }
      } catch (err: any) {
        lastError = err
        const isRateLimit = err?.message?.includes('429') || err?.status === 429
        const backoffMs = isRateLimit ? 1000 * Math.pow(2, attempt) : 500 * attempt
        await new Promise((resolve) => setTimeout(resolve, backoffMs))
      }
    }

    throw new Error(`OpenAI embedding failed after ${this.maxRetries} attempts: ${lastError?.message}`)
  }

  /**
   * Sinh vector chuẩn hóa 1536-dim có tính đơn vị (unit length) phục vụ testing không tốn API call
   */
  private generateDeterministicMockEmbeddings(texts: string[]): BatchEmbeddingResponse {
    const results: EmbeddingResult[] = texts.map((t, idx) => {
      const vec = new Array(this.dimensions).fill(0)
      const textLen = t.length || 1
      for (let d = 0; d < this.dimensions; d++) {
        vec[d] = Math.sin((d + 1) * textLen)
      }
      // Normalize to unit length for Cosine similarity
      const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0)) || 1
      const normalized = vec.map((v) => v / norm)

      return {
        index: idx,
        embedding: normalized,
        tokenCount: Math.ceil(t.split(/\s+/).length * 1.3),
      }
    })

    return {
      embeddings: results,
      totalTokens: results.reduce((acc, r) => acc + (r.tokenCount || 0), 0),
      model: this.model,
      dimensions: this.dimensions,
    }
  }
}
