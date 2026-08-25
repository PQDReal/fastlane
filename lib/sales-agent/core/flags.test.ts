import { afterEach, describe, expect, it, vi } from 'vitest'

import { isSalesAgentVisualKnowledgeDraftsAllowed } from './flags'

afterEach(() => vi.unstubAllEnvs())

describe('visual knowledge draft release gate', () => {
  it('allows pending admin-review visuals outside production', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('SALES_AGENT_VISUAL_KNOWLEDGE_DRAFTS_ALLOWED', '')
    expect(isSalesAgentVisualKnowledgeDraftsAllowed()).toBe(true)

    vi.stubEnv('SALES_AGENT_VISUAL_KNOWLEDGE_DRAFTS_ALLOWED', 'true')
    expect(isSalesAgentVisualKnowledgeDraftsAllowed()).toBe(true)
  })

  it('gates pending admin-review visuals in production by default', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SALES_AGENT_VISUAL_KNOWLEDGE_DRAFTS_ALLOWED', '')
    expect(isSalesAgentVisualKnowledgeDraftsAllowed()).toBe(false)

    vi.stubEnv('SALES_AGENT_VISUAL_KNOWLEDGE_DRAFTS_ALLOWED', 'true')
    expect(isSalesAgentVisualKnowledgeDraftsAllowed()).toBe(true)
  })
})
