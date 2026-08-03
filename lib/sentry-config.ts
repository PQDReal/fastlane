import type { ErrorEvent, EventHint } from '@sentry/nextjs'

const PRIVATE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-auth-token',
  'x-api-key',
])

export function sentrySampleRate(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback
}

export function scrubSentryEvent(event: ErrorEvent, _hint: EventHint) {
  if (event.request) {
    const headers = Object.fromEntries(
      Object.entries(event.request.headers ?? {}).filter(
        ([name]) => !PRIVATE_HEADERS.has(name.toLowerCase()),
      ),
    )
    event.request = {
      ...event.request,
      cookies: undefined,
      data: undefined,
      headers,
      query_string: undefined,
      url: event.request.url?.split('?')[0],
    }
  }

  if (event.user) {
    event.user = event.user.id ? { id: event.user.id } : undefined
  }

  return event
}