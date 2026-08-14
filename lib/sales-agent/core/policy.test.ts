import { describe, expect, it } from 'vitest'

import { SALES_AGENT_MARKDOWN_TEMPLATE } from './markdown-template'
import { buildSalesAgentProviderInput, SALES_AGENT_SYSTEM_PROMPT } from './policy'

describe('Sales Agent Markdown policy', () => {
  it('defines compact templates for the supported answer types', () => {
    expect(SALES_AGENT_MARKDOWN_TEMPLATE).toContain('MẪU SO SÁNH')
    expect(SALES_AGENT_MARKDOWN_TEMPLATE).toContain('| Tiêu chí | [Xe A] | [Xe B] |')
    expect(SALES_AGENT_MARKDOWN_TEMPLATE).toContain('MẪU HƯỚNG DẪN / THỦ TỤC')
    expect(SALES_AGENT_MARKDOWN_TEMPLATE).toContain('MẪU DỮ LIỆU TỪNG PHẦN')
    expect(SALES_AGENT_MARKDOWN_TEMPLATE).toContain('\\[ ... \\]')
    expect(SALES_AGENT_SYSTEM_PROMPT).toContain(SALES_AGENT_MARKDOWN_TEMPLATE)
    expect(SALES_AGENT_SYSTEM_PROMPT).toContain('không mặc định biến toàn bộ câu trả lời')
    expect(SALES_AGENT_SYSTEM_PROMPT).toContain('không dùng số lượng tồn kho')
  })

  it('places the Markdown contract in the system message sent to providers', () => {
    const input = buildSalesAgentProviderInput('So sánh VF 7 và VF 8')
    expect(input.messages[0]).toEqual({ role: 'system', content: SALES_AGENT_SYSTEM_PROMPT })
    expect(SALES_AGENT_SYSTEM_PROMPT).toContain('Không tự hỏi phiên bản hoặc năm sản xuất')
  })
})
