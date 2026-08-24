import { describe, it, expect } from 'vitest'
import {
  buildHierarchicalChunks,
  estimateTokenCount,
  type DocumentTreeInput,
} from './hierarchical-chunker'

describe('Hierarchical Chunker v1 (A19-KR-203)', () => {
  it('estimates token count accurately for Vietnamese text', () => {
    const text = 'Chính sách bảo hành xe điện VinFast 10 năm'
    const tokens = estimateTokenCount(text)
    expect(tokens).toBeGreaterThan(5)
  })

  it('builds full 4-level chunk hierarchy with stable pointers', () => {
    const docTree: DocumentTreeInput = {
      documentKey: 'vinfast:VF8:2025:vi-VN',
      title: 'Sổ tay hướng dẫn sử dụng VinFast VF 8 2025',
      category: 'TECHNICAL_GUIDE',
      vehicleModel: 'VF 8',
      modelYear: 2025,
      sections: [
        {
          chapterTitle: 'Động cơ & Truyền động',
          sectionTitle: 'Thông số công suất động cơ AWD',
          contentMarkdown:
            'Bản Plus trang bị 2 động cơ điện AWD cho công suất 402 mã lực và mô-men xoắn 620 Nm.',
        },
        {
          chapterTitle: 'Pin & Hệ thống sạc',
          sectionTitle: 'Quy trình sạc siêu nhanh DC',
          contentMarkdown:
            '1. Đỗ xe tại trụ sạc V-GREEN.\n2. Cắm sạc CCS2 vào cổng sạc xe.\n3. Quẹt thẻ hoặc bắt đầu trên ứng dụng.\n4. Đợi pin sạc từ 10% đến 70% trong 24 phút.\n\n**CẢNH BÁO:** Không giật mạnh cáp khi đang sạc.',
        },
      ],
    }

    const chunks = buildHierarchicalChunks(docTree)
    expect(chunks.length).toBeGreaterThanOrEqual(4)

    // Root chunk
    const rootChunk = chunks.find((c) => c.chunkLevel === 0)
    expect(rootChunk).toBeDefined()
    expect(rootChunk?.hierarchyPath).toBe('root')

    // Chapter chunks
    const chapterChunks = chunks.filter((c) => c.chunkLevel === 1)
    expect(chapterChunks.length).toBe(2)

    // Section chunks
    const sectionChunks = chunks.filter((c) => c.chunkLevel === 2)
    expect(sectionChunks.length).toBe(2)

    // Check tags extraction
    const adasOrPowerChunk = chunks.find((c) => c.content.includes('402 mã lực'))
    expect(adasOrPowerChunk?.tags).toContain('powertrain')

    // Check warning detection
    const chargingChunk = chunks.find((c) => c.content.includes('CẢNH BÁO'))
    expect(chargingChunk?.isWarning).toBe(true)
    expect(chargingChunk?.isProcedure).toBe(true)
  })
})
