import { describe, it, expect } from 'vitest'
import { chunkMarkdownDocument, extractTagsFromText } from './chunker'

describe('Knowledge Chunker', () => {
  it('extracts relevant vehicle and policy tags', () => {
    const text = 'Chính sách bảo hành pin xe VF 8 và VF 9 lên tới 10 năm hoặc 200000 km, trạm sạc V-GREEN.'
    const tags = extractTagsFromText(text, 'Bảo hành pin')

    expect(tags).toContain('bảo hành')
    expect(tags).toContain('vf 8')
    expect(tags).toContain('vf 9')
    expect(tags).toContain('10 năm')
    expect(tags).toContain('v-green')
  })

  it('chunks markdown by sections with titles and indexes', () => {
    const md = `
# Chính sách bảo hành
## 1. Thời hạn bảo hành
Bảo hành xe 10 năm cho VF 8, VF 9 và 7 năm cho VF 3.

## 2. Bảo hành pin cao áp
Pin được thay mới miễn phí nếu dung lượng nạp xả dưới 70%.
    `.trim()

    const chunks = chunkMarkdownDocument(md, 'Chính sách bảo hành')

    expect(chunks).toHaveLength(2)
    expect(chunks[0].chunkIndex).toBe(0)
    expect(chunks[0].sectionTitle).toBe('Thời hạn bảo hành')
    expect(chunks[0].content).toContain('10 năm cho VF 8')

    expect(chunks[1].chunkIndex).toBe(1)
    expect(chunks[1].sectionTitle).toBe('Bảo hành pin cao áp')
    expect(chunks[1].content).toContain('dung lượng nạp xả dưới 70%')
  })

  it('handles single paragraph or unformatted markdown safely', () => {
    const raw = 'Đây là nội dung ngắn gọn không có tiêu đề mục.'
    const chunks = chunkMarkdownDocument(raw, 'Tài liệu ngắn')

    expect(chunks).toHaveLength(1)
    expect(chunks[0].sectionTitle).toBe('Tài liệu ngắn')
    expect(chunks[0].content).toBe(raw)
  })
})
