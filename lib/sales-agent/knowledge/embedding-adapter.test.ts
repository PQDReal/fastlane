import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  OPENAI_EMBEDDING_DIMENSIONS,
  OpenAIEmbeddingAdapter,
} from './embedding-adapter'

const vector = (value = 0.1) => Array.from({ length: OPENAI_EMBEDDING_DIMENSIONS }, () => value)

describe('OpenAIEmbeddingAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fails closed without an API key', () => {
    expect(() => new OpenAIEmbeddingAdapter({ apiKey: '' }))
      .toThrow('OPENAI_API_KEY is required')
  })

  it('orders a batch by the response indexes and pins the requested model and dimensions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: 'text-embedding-3-small',
      data: [
        { index: 1, embedding: vector(0.2) },
        { index: 0, embedding: vector(0.1) },
      ],
      usage: { total_tokens: 7 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await new OpenAIEmbeddingAdapter({ apiKey: 'test-key', maxRetries: 0 })
      .generateEmbeddings(['first', 'second'])

    expect(result.embeddings.map((item) => item.index)).toEqual([0, 1])
    expect(result.totalTokens).toBe(7)
    const request = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(request).toMatchObject({ model: 'text-embedding-3-small', dimensions: OPENAI_EMBEDDING_DIMENSIONS })
  })

  it('does not retry a malformed successful response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: 'text-embedding-3-small',
      data: [{ index: 0, embedding: [1] }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new OpenAIEmbeddingAdapter({ apiKey: 'test-key', maxRetries: 3 })
      .generateEmbeddings(['first']))
      .rejects.toThrow('invalid dimensions')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not retry a non-retryable OpenAI HTTP error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('bad request', { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new OpenAIEmbeddingAdapter({ apiKey: 'test-key', maxRetries: 3 })
      .generateEmbeddings(['first']))
      .rejects.toThrow('OpenAI embeddings error 400')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
