import { NextResponse } from 'next/server'
import { describe, expect, it } from 'vitest'

import { createServerTiming } from './server-timing'

describe('server timing', () => {
  it('attaches stage and total durations to the response', () => {
    const timing = createServerTiming()
    timing.measure('rpc', performance.now() - 1)

    const response = timing.attach(NextResponse.json({ ok: true }))
    const header = response.headers.get('server-timing') ?? ''

    expect(header).toMatch(/rpc;dur=\d+\.\d/)
    expect(header).toMatch(/total;dur=\d+\.\d/)
  })

  it('supports a named total and preserves existing metrics', () => {
    const timing = createServerTiming('middleware')
    const response = NextResponse.json(
      { ok: true },
      { headers: { 'Server-Timing': 'route;dur=2.0' } },
    )

    const header = timing.attach(response).headers.get('server-timing') ?? ''

    expect(header).toMatch(/^route;dur=2\.0, middleware;dur=\d+\.\d$/)
  })
})
