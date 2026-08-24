import { afterEach, describe, expect, it, vi } from 'vitest'

import { isSalesAgentVisualKnowledgeDraftsAllowed } from './flags'

afterEach(() => vi.unstubAllEnvs())

describe('visual knowledge draft release gate', () => {
  it('is opt-in outside production', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('SALES_AGENT_VISUAL_KNOWLEDGE_ALLOW_DRAFTS', '')
    expect(isSalesAgentVisualKnowledgeDraftsAllowed()).toBe(false)

    vi.stubEnv('SALES_AGENT_VISUAL_KNOWLEDGE_ALLOW_DRAFTS', 'true')
    expect(isSalesAgentVisualKnowledgeDraftsAllowed()).toBe(true)
  })

  it('cannot expose drafts in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SALES_AGENT_VISUAL_KNOWLEDGE_ALLOW_DRAFTS', 'true')
    expect(isSalesAgentVisualKnowledgeDraftsAllowed()).toBe(false)
  })
})
