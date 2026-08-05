import type { NextResponse } from 'next/server'

type TimingEntry = {
  name: string
  durationMs: number
}

function duration(startedAt: number) {
  return Math.max(0, performance.now() - startedAt)
}

function formatDuration(value: number) {
  return value.toFixed(1)
}

export function createServerTiming() {
  const startedAt = performance.now()
  const entries: TimingEntry[] = []

  return {
    measure(name: string, startedAtForEntry: number) {
      entries.push({ name, durationMs: duration(startedAtForEntry) })
    },
    attach<T extends NextResponse>(response: T): T {
      entries.push({ name: 'total', durationMs: duration(startedAt) })
      response.headers.set(
        'Server-Timing',
        entries
          .map(({ name, durationMs }) => `${name};dur=${formatDuration(durationMs)}`)
          .join(', '),
      )
      return response
    },
  }
}
