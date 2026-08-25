import { describe, expect, it } from 'vitest'

import { SALES_AGENT_MARKDOWN_TEMPLATE } from './markdown-template'
import { buildSalesAgentProviderInput, SALES_AGENT_SYSTEM_PROMPT } from './policy'
import { getSalesAgentSystemPrompt } from '../prompt/manifest'

describe('Sales Agent Markdown policy', () => {
  it('defines one compact presentation contract', () => {
    expect(SALES_AGENT_MARKDOWN_TEMPLATE).toContain('So sánh bằng bảng')
    expect(SALES_AGENT_MARKDOWN_TEMPLATE).toContain('Quy trình dùng danh sách đánh số')
    expect(SALES_AGENT_MARKDOWN_TEMPLATE).toContain('[media:N]')
    expect(SALES_AGENT_MARKDOWN_TEMPLATE).toContain('media[].reference')
    expect(SALES_AGENT_SYSTEM_PROMPT).toContain('[media:N]')
    expect(SALES_AGENT_SYSTEM_PROMPT).toContain('không mặc định biến toàn bộ câu trả lời')
    expect(SALES_AGENT_SYSTEM_PROMPT).toContain('không dùng số lượng tồn kho')
  })

  it('uses the canonical manifest in the legacy provider entry point', () => {
    const input = buildSalesAgentProviderInput('So sánh VF 7 và VF 8')
    expect(input.messages[0]).toEqual({ role: 'system', content: SALES_AGENT_SYSTEM_PROMPT })
    expect(SALES_AGENT_SYSTEM_PROMPT).toBe(getSalesAgentSystemPrompt({ knowledgeEnabled: true }))
    expect(SALES_AGENT_SYSTEM_PROMPT).toContain('Không tự hỏi phiên bản hoặc năm sản xuất')
  })
})
