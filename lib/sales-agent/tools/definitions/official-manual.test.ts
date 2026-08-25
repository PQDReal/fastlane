import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { executeDataTool } from './index'

describe('official motorbike manual data boundary', () => {
  it('returns the exact Klara S PDF metadata without replacing develop manual snippets', async () => {
    const result = await executeDataTool(
      'search_user_manuals',
      { query: 'Hướng dẫn sử dụng xe Klara S', topK: 3 },
      'call-official-klara-s',
    )

    expect(result.outcome).toBe('SUCCESS')
    if (result.outcome !== 'SUCCESS') return

    expect(result.completeness).toBe('PARTIAL')
    expect(result.data.snippets).toEqual([])
    expect(result.data.officialDocuments).toEqual([
      expect.objectContaining({
        id: 'klara-s',
        label: 'HDSD xe Klara S',
        contentBoundary: 'LINK_ONLY',
        internalUrl: '/after-sales?vehicle=motorbike&tab=warranty#official-documents',
      }),
    ])
    expect(result.data.officialDocuments[0].sourceUrl).toContain('static-cms-prod.vinfastauto.com')
  })

  it('exposes the canonical reviewed motorbike-warranty route as tool data', async () => {
    const result = await executeDataTool(
      'search_knowledge',
      { query: 'bảo hành pin xe máy điện Evo' },
      'call-motorbike-warranty-route',
    )

    expect(result.outcome).toBe('SUCCESS')
    if (result.outcome !== 'SUCCESS') return

    expect(result.data.snippets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        internalUrl: '/after-sales?vehicle=motorbike&tab=warranty#warranty-term',
      }),
    ]))
  })
})
