type TimingEntry = {
  name: string
  durationMs: number
}

export type ServerTimingRecorder = {
  measure(name: string, startedAtForEntry: number): void
}

function duration(startedAt: number) {
  return Math.max(0, performance.now() - startedAt)
}

function formatDuration(value: number) {
  return value.toFixed(1)
}

export function createServerTiming(totalName = 'total') {
  const startedAt = performance.now()
  const entries: TimingEntry[] = []

  return {
    measure(name: string, startedAtForEntry: number) {
      entries.push({ name, durationMs: duration(startedAtForEntry) })
    },
    attach<T extends Response>(response: T): T {
      entries.push({ name: totalName, durationMs: duration(startedAt) })
      const measuredValue = entries
        .map(({ name, durationMs }) => `${name};dur=${formatDuration(durationMs)}`)
        .join(', ')
      const existingValue = response.headers.get('Server-Timing')
      response.headers.set(
        'Server-Timing',
        existingValue ? `${existingValue}, ${measuredValue}` : measuredValue,
      )
      return response
    },
  }
}
