import { beforeEach, describe, expect, it, vi } from 'vitest'

const search = vi.hoisted(() => vi.fn())
vi.mock('@/lib/sales-agent/interactions/search', () => ({ searchSalesAgentInteraction: search }))

import { POST } from './route'

describe('Sales Agent interaction search API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('bounds and forwards the signed search request', async () => {
    search.mockResolvedValue({ schemaVersion: '1.0', options: [] })
    const response = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ conversationId: 'conversation', continuationToken: 'signed', query: 'EvoGrand', selectedOptionIds: ['a'] }),
    }))

    expect(response.status).toBe(200)
    expect(search).toHaveBeenCalledWith({ continuationToken: 'signed', conversationId: 'conversation', query: 'EvoGrand', selectedOptionIds: ['a'] })
  })

  it('rejects a request without conversation binding', async () => {
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ continuationToken: 'signed' }) }))
    expect(response.status).toBe(400)
    expect(search).not.toHaveBeenCalled()
  })
})
