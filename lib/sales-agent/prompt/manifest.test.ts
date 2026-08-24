import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { getSalesAgentSystemPrompt } from './manifest'

describe('Sales Agent prompt capability gate', () => {
  it('does not expose Knowledge RAG instructions while disabled', () => {
    expect(getSalesAgentSystemPrompt({ knowledgeEnabled: false })).not.toContain('search_knowledge')
  })

  it('includes Knowledge RAG instructions when enabled', () => {
    expect(getSalesAgentSystemPrompt({ knowledgeEnabled: true })).toContain('search_knowledge')
  })

  it('does not teach the model to invent product slugs or removed application routes', () => {
    const prompt = getSalesAgentSystemPrompt({ knowledgeEnabled: true })
    expect(prompt).toContain('KHÔNG tự suy luận slug')
    expect(prompt).not.toContain('/financing')
    expect(prompt).not.toContain('/charging-stations')
    expect(prompt).not.toContain('/knowledge/[slug]')
  })
})
