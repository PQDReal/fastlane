export const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small'
export const OPENAI_EMBEDDING_DIMENSIONS = 512
export const OPENAI_EMBEDDING_GENERATION_ID = 'openai-text-embedding-3-small-512-v1'

export interface EmbeddingAdapterConfig {
  apiKey?: string
  model?: string
  dimensions?: number
  maxBatchSize?: number
  timeoutMs?: number
  maxRetries?: number
  baseUrl?: string
  organizationId?: string
  projectId?: string
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

export interface EmbeddingProvider {
  generateEmbeddings(texts: string[]): Promise<BatchEmbeddingResponse>
}

interface OpenAIEmbeddingResponse {
  data?: Array<{ index?: number; embedding?: number[] }>
  usage?: { total_tokens?: number }
  model?: string
}

class OpenAIHttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'OpenAIHttpError'
  }
}

class EmbeddingValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmbeddingValidationError'
  }
}

export class OpenAIEmbeddingAdapter implements EmbeddingProvider {
  private readonly apiKey: string
  private readonly model: string
  private readonly dimensions: number
  private readonly maxBatchSize: number
  private readonly timeoutMs: number
  private readonly maxRetries: number
  private readonly baseUrl: string
  private readonly organizationId?: string
  private readonly projectId?: string

  constructor(config: EmbeddingAdapterConfig = {}) {
    this.apiKey = (config.apiKey ?? process.env.OPENAI_API_KEY ?? '').trim()
    this.model = (config.model || OPENAI_EMBEDDING_MODEL).trim()
    this.dimensions = config.dimensions ?? OPENAI_EMBEDDING_DIMENSIONS
    this.maxBatchSize = config.maxBatchSize ?? 256
    this.timeoutMs = config.timeoutMs ?? 30_000
    this.maxRetries = config.maxRetries ?? 5
    this.baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')
    this.organizationId = config.organizationId || process.env.OPENAI_ORG_ID
    this.projectId = config.projectId || process.env.OPENAI_PROJECT_ID

    if (this.model !== OPENAI_EMBEDDING_MODEL) {
      throw new Error(`Invalid embedding model: expected ${OPENAI_EMBEDDING_MODEL}, got ${this.model}`)
    }
    if (this.dimensions !== OPENAI_EMBEDDING_DIMENSIONS) {
      throw new Error(`Invalid dimensions: expected ${OPENAI_EMBEDDING_DIMENSIONS}, got ${this.dimensions}`)
    }
    if (!Number.isInteger(this.maxBatchSize) || this.maxBatchSize < 1 || this.maxBatchSize > 512) {
      throw new Error(`Invalid maxBatchSize: expected an integer between 1 and 512, got ${this.maxBatchSize}`)
    }
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new Error('Invalid embedding timeout configuration')
    }
    if (!Number.isInteger(this.maxRetries) || this.maxRetries < 0 || this.maxRetries > 8) {
      throw new Error('Invalid embedding retry configuration')
    }
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is required for OpenAIEmbeddingAdapter (fail-closed)')
    }
  }

  async generateEmbeddings(texts: string[]): Promise<BatchEmbeddingResponse> {
    if (!Array.isArray(texts)) throw new Error('Embedding inputs must be an array')
    if (texts.length === 0) {
      return {
        embeddings: [],
        totalTokens: 0,
        model: this.model,
        dimensions: this.dimensions,
      }
    }
    if (texts.some((text) => typeof text !== 'string' || !text.trim())) {
      throw new Error('Embedding inputs must be non-empty strings')
    }

    const embeddings: EmbeddingResult[] = []
    let totalTokens = 0
    for (let offset = 0; offset < texts.length; offset += this.maxBatchSize) {
      const batch = texts.slice(offset, offset + this.maxBatchSize)
      const response = await this.callOpenAIWithRetry(batch, offset)
      embeddings.push(...response.embeddings)
      totalTokens += response.totalTokens
    }

    if (embeddings.length !== texts.length) {
      throw new Error(`Embedding result count mismatch: expected ${texts.length}, got ${embeddings.length}`)
    }
    return { embeddings, totalTokens, model: this.model, dimensions: this.dimensions }
  }

  private async callOpenAIWithRetry(
    batch: string[],
    offset: number,
  ): Promise<{ embeddings: EmbeddingResult[]; totalTokens: number }> {
    let lastError: Error | undefined

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs)
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        }
        if (this.organizationId) headers['OpenAI-Organization'] = this.organizationId
        if (this.projectId) headers['OpenAI-Project'] = this.projectId

        const response = await fetch(`${this.baseUrl}/embeddings`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            input: batch,
            model: this.model,
            dimensions: this.dimensions,
            encoding_format: 'float',
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const body = (await response.text()).slice(0, 2_000)
          throw new OpenAIHttpError(response.status, `OpenAI embeddings error ${response.status}: ${body}`)
        }

        const data = await response.json() as OpenAIEmbeddingResponse
        if (data.model && data.model !== this.model) {
          throw new EmbeddingValidationError(`OpenAI returned model ${data.model}; expected ${this.model}`)
        }
        if (!Array.isArray(data.data) || data.data.length !== batch.length) {
          throw new EmbeddingValidationError(`OpenAI returned ${data.data?.length ?? 0} embeddings for ${batch.length} inputs`)
        }

        const ordered = new Array<EmbeddingResult>(batch.length)
        for (const item of data.data) {
          const localIndex = Number(item.index)
          if (!Number.isInteger(localIndex) || localIndex < 0 || localIndex >= batch.length) {
            throw new EmbeddingValidationError(`OpenAI returned an invalid embedding index: ${String(item.index)}`)
          }
          if (!Array.isArray(item.embedding) || item.embedding.length !== this.dimensions) {
            throw new EmbeddingValidationError(`OpenAI returned invalid dimensions at batch index ${localIndex}`)
          }
          if (item.embedding.some((value) => !Number.isFinite(value))) {
            throw new EmbeddingValidationError(`OpenAI returned a non-finite vector at batch index ${localIndex}`)
          }
          const magnitude = Math.sqrt(item.embedding.reduce((sum, value) => sum + value * value, 0))
          if (!Number.isFinite(magnitude) || magnitude <= 0.1) {
            throw new EmbeddingValidationError(`OpenAI returned a near-zero vector at batch index ${localIndex}`)
          }
          if (ordered[localIndex]) throw new EmbeddingValidationError(`OpenAI returned duplicate embedding index ${localIndex}`)
          ordered[localIndex] = { index: offset + localIndex, embedding: item.embedding }
        }
        if (ordered.some((item) => !item)) throw new EmbeddingValidationError('OpenAI embedding response has missing indexes')
        const totalTokens = Number(data.usage?.total_tokens || 0)
        if (!Number.isSafeInteger(totalTokens) || totalTokens < 0) {
          throw new EmbeddingValidationError('OpenAI returned invalid token usage')
        }
        return { embeddings: ordered, totalTokens }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        const status = error instanceof OpenAIHttpError ? error.status : undefined
        const retryable = !(error instanceof EmbeddingValidationError) &&
          (status === undefined || status === 408 || status === 409 || status === 429 || status >= 500)
        if (!retryable || attempt >= this.maxRetries) break
        const baseDelay = status === 429 ? 6_000 : 500
        const delayMs = Math.min(15_000, baseDelay * 2 ** attempt) + Math.floor(Math.random() * 500)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      } finally {
        clearTimeout(timeoutId)
      }
    }

    throw new Error(`OpenAI embedding failed after ${this.maxRetries + 1} attempts: ${lastError?.message || 'unknown error'}`)
  }
}
