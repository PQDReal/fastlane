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
})
