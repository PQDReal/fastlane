import 'server-only'

import { randomUUID } from 'node:crypto'

import { recordSalesAgentDebugEvent, type SalesAgentDebugContext } from '../debug-log'
import type { SalesAgentProviderConfig } from './types'

type ObservedFetchOptions = {
  config: SalesAgentProviderConfig
  debugContext?: SalesAgentDebugContext
}

export type ObservedProviderFetch = typeof fetch & {
  setActiveModelCallKey?: (modelCallKey: string | undefined) => void
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function elapsedMs(startedAt: number) {
  return Math.max(0, Math.round(nowMs() - startedAt))
}

function inputUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

function safeUrl(input: RequestInfo | URL) {
  const raw = inputUrl(input)
  try {
    const url = new URL(raw)
    return `${url.origin}${url.pathname}`
  } catch {
    return raw.split('?')[0]
  }
}

function numberHeader(headers: Headers, name: string) {
  const value = headers.get(name)
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function responseHeaders(response: Response) {
  return {
    serverRequestId: response.headers.get('x-request-id') ?? undefined,
    openaiProcessingMs: numberHeader(response.headers, 'openai-processing-ms'),
    openaiVersion: response.headers.get('openai-version') ?? undefined,
    rateLimit: {
      requestsRemaining: numberHeader(response.headers, 'x-ratelimit-remaining-requests'),
      tokensRemaining: numberHeader(response.headers, 'x-ratelimit-remaining-tokens'),
      requestsReset: response.headers.get('x-ratelimit-reset-requests') ?? undefined,
      tokensReset: response.headers.get('x-ratelimit-reset-tokens') ?? undefined,
    },
  }
}

/**
 * Captures transport-level timings that the AI SDK's model timing cannot expose:
 * HTTP headers received, first response body byte, response completion, provider
 * request IDs, and OpenAI's `openai-processing-ms` header when available.
 */
export function createObservedProviderFetch({ config, debugContext }: ObservedFetchOptions): ObservedProviderFetch {
  let activeModelCallKey: string | undefined

  const observedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const startedAt = nowMs()
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    const url = safeUrl(input)
    const clientRequestId = `fastlane-${debugContext?.requestId ?? randomUUID()}-${randomUUID()}`
    const headers = new Headers(input instanceof Request ? input.headers : undefined)
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
    if (config.provider === 'openai') headers.set('X-Client-Request-Id', clientRequestId)

    let response: Response
    try {
      response = await fetch(input, { ...init, headers })
    } catch (error) {
      recordSalesAgentDebugEvent('provider.request.failed', debugContext, {
        provider: config.provider,
        model: config.model,
        method,
        url,
        clientRequestId,
        modelCallKey: activeModelCallKey,
        elapsedMs: elapsedMs(startedAt),
        error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
      })
      throw error
    }

    const headerTiming = responseHeaders(response)
    const headersLatencyMs = elapsedMs(startedAt)
    recordSalesAgentDebugEvent('provider.request.headers_received', debugContext, {
      provider: config.provider,
      model: config.model,
      method,
      url,
      status: response.status,
      clientRequestId,
      modelCallKey: activeModelCallKey,
      headersLatencyMs,
      contentType: response.headers.get('content-type') ?? undefined,
      contentLength: numberHeader(response.headers, 'content-length'),
      ...headerTiming,
    })

    if (!response.body) {
      recordSalesAgentDebugEvent('provider.request.completed', debugContext, {
        provider: config.provider,
        model: config.model,
        method,
        url,
        status: response.status,
        clientRequestId,
        modelCallKey: activeModelCallKey,
        firstByteLatencyMs: headersLatencyMs,
        totalLatencyMs: headersLatencyMs,
        bytes: 0,
        ...headerTiming,
      })
      return response
    }

    const reader = response.body.getReader()
    let firstByteLatencyMs: number | undefined
    let bytes = 0
    let finished = false

    const finish = (outcome: 'SUCCESS' | 'FAILED' | 'CANCELLED', error?: unknown) => {
      if (finished) return
      finished = true
      recordSalesAgentDebugEvent(
        outcome === 'SUCCESS' ? 'provider.request.completed' : 'provider.request.failed',
        debugContext,
        {
          provider: config.provider,
          model: config.model,
          method,
          url,
          status: response.status,
          clientRequestId,
          modelCallKey: activeModelCallKey,
          outcome,
          headersLatencyMs,
          firstByteLatencyMs,
          bodyTransferMs: firstByteLatencyMs == null ? undefined : Math.max(0, elapsedMs(startedAt) - firstByteLatencyMs),
          totalLatencyMs: elapsedMs(startedAt),
          bytes,
          ...headerTiming,
          error: error === undefined
            ? undefined
            : error instanceof Error ? { name: error.name, message: error.message } : String(error),
        },
      )
    }

    const observedBody = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const chunk = await reader.read()
          if (chunk.done) {
            finish('SUCCESS')
            controller.close()
            return
          }
          if (firstByteLatencyMs === undefined) {
            firstByteLatencyMs = elapsedMs(startedAt)
            recordSalesAgentDebugEvent('provider.request.first_byte', debugContext, {
              provider: config.provider,
              model: config.model,
              method,
              url,
              status: response.status,
              clientRequestId,
              modelCallKey: activeModelCallKey,
              headersLatencyMs,
              firstByteLatencyMs,
              bodyWaitAfterHeadersMs: Math.max(0, firstByteLatencyMs - headersLatencyMs),
              ...headerTiming,
            })
          }
          bytes += chunk.value?.byteLength ?? 0
          controller.enqueue(chunk.value)
        } catch (error) {
          finish('FAILED', error)
          controller.error(error)
        }
      },
      async cancel(reason) {
        try {
          await reader.cancel(reason)
        } finally {
          finish('CANCELLED', reason)
        }
      },
    })

    return new Response(observedBody, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }

  const typedObservedFetch = observedFetch as ObservedProviderFetch
  typedObservedFetch.setActiveModelCallKey = (modelCallKey) => {
    activeModelCallKey = modelCallKey
  }
  return typedObservedFetch
}
