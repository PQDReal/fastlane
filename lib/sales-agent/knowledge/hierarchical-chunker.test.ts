import { describe, it, expect } from 'vitest'
import {
  buildHierarchicalChunks,
  CHUNK_HARD_MAX_TOKENS,
  estimateTokenCount,
  splitSectionIntoLeaves,
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

  it('enforces a hard cap and creates real overlap even for a giant paragraph', () => {
    const words = Array.from({ length: 1500 }, (_, index) => `token${index}`)
    const leaves = splitSectionIntoLeaves(words.join(' '))

    expect(leaves.length).toBeGreaterThan(3)
    expect(Math.max(...leaves.map(estimateTokenCount))).toBeLessThanOrEqual(CHUNK_HARD_MAX_TOKENS)
    const firstTail = leaves[0].trim().split(/\s+/).slice(-20)
    const secondWords = new Set(leaves[1].trim().split(/\s+/))
    expect(firstTail.some((word) => secondWords.has(word))).toBe(true)
  })

  it('preserves extractedImages in leaf chunks containing compact image placeholders', () => {
    const longParagraphs = Array.from({ length: 30 }, (_, i) => 
      `Đoạn văn bản kỹ thuật chi tiết số ${i + 1} mô tả các thông số vận hành và kiểm tra hệ thống cổng sạc xe VinFast VF 8 Plus và Eco.`
    ).join('\n\n')

    const htmlContent = `
      # Cổng sạc và Ăng-ten
      ${longParagraphs}
      <img id="img_charge_port" src="https://om.vinfastauto.com/assets/images/charge_port.png" alt="Sơ đồ cổng sạc" />
      ${longParagraphs}
      <img id="img_antenna" src="https://om.vinfastauto.com/assets/images/antenna_pos.png" alt="Vị trí ăng-ten" />
    `

    const docTree: DocumentTreeInput = {
      documentKey: 'vinfast:VF8:2025:vi-VN',
      title: 'Sổ tay VF 8',
      category: 'TECHNICAL_GUIDE',
      sections: [
        {
          chapterTitle: 'Tổng quan',
          sectionTitle: 'Cổng sạc và Ăng-ten',
          contentMarkdown: htmlContent,
        },
      ],
    }

    const chunks = buildHierarchicalChunks(docTree)
    const leafChunks = chunks.filter((c) => c.chunkLevel === 3)
    expect(leafChunks.length).toBeGreaterThanOrEqual(2)

    // Verify each leaf chunk containing [img: ...] has non-empty extractedImages with matching fileName
    const chunksWithImages = leafChunks.filter((c) => c.content.includes('[img:'))
    expect(chunksWithImages.length).toBeGreaterThan(0)
    for (const chunk of chunksWithImages) {
      expect(chunk.extractedImages).toBeDefined()
      expect(chunk.extractedImages!.length).toBeGreaterThan(0)
      for (const img of chunk.extractedImages!) {
        expect(img.url).toMatch(/^https:\/\//)
        expect(chunk.content).toContain(`[img: ${img.fileName || img.url.split('/').pop()}]`)
      }
    }
  })

  it('splits large Markdown tables while preserving header row, column structure, and newlines', () => {
    const header = '| STT | Tên phụ tùng | Mã linh kiện | Thông số |\n| --- | --- | --- | --- |'
    const rows = Array.from({ length: 40 }, (_, i) => 
      `| ${i + 1} | Cảm biến radar trước ${i + 1} | RAD-VF8-00${i + 1} | 77 GHz FMCW |`
    ).join('\n')
    const fullTable = `${header}\n${rows}`

    const leaves = splitSectionIntoLeaves(fullTable)
    expect(leaves.length).toBeGreaterThanOrEqual(2)

    for (const leaf of leaves) {
      // Every split table chunk MUST contain the table header & separator
      expect(leaf).toContain('| STT | Tên phụ tùng | Mã linh kiện | Thông số |')
      expect(leaf).toContain('| --- | --- | --- | --- |')
      // Must contain newlines between rows (NOT flattened into a single line)
      expect(leaf.split('\n').length).toBeGreaterThanOrEqual(3)
      // Must not exceed hard max tokens
      expect(estimateTokenCount(leaf)).toBeLessThanOrEqual(CHUNK_HARD_MAX_TOKENS)
    }
  })
})
