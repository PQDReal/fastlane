import { describe, expect, it } from 'vitest'

import {
  isSalesAgentInternalUrl,
  salesAgentKnowledgeSourceUrl,
} from './paths'

describe('sales-agent navigation paths', () => {
  it('builds a server-controlled knowledge source URL for a valid chunk UUID', () => {
    const chunkId = '951985cc-7f87-4d8e-97ce-f6ecda1a15c0'

    expect(salesAgentKnowledgeSourceUrl(chunkId)).toBe(`/knowledge/source/${chunkId}`)
    expect(isSalesAgentInternalUrl(`/knowledge/source/${chunkId}`)).toBe(true)
  })

  it('rejects malformed or traversal-like knowledge source identifiers', () => {
    expect(salesAgentKnowledgeSourceUrl('../admin')).toBeNull()
    expect(salesAgentKnowledgeSourceUrl('not-a-uuid')).toBeNull()
    expect(isSalesAgentInternalUrl('/knowledge/source/../admin')).toBe(false)
  })
})
