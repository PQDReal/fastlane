import { describe, it, expect } from 'vitest'
import { canonicalizeDocumentContent } from './canonicalizer'

describe('Canonicalizer (A19-KR-202)', () => {
  it('handles empty or malformed inputs without throwing', () => {
    const empty = canonicalizeDocumentContent('')
    const malformed = canonicalizeDocumentContent('<div><p>Chưa đóng thẻ')

    expect(empty.normalizedMarkdown).toBe('')
    expect(malformed.normalizedMarkdown).toContain('Chưa đóng thẻ')
    expect(empty.checksum).toHaveLength(64)
  })

  it('preserves HTML img tags with id and src as structured markdown and extracted list', () => {
    const html = `
      <p class="Detail-Heading" id="xyz123">Tổng quan về xe điện</p>
      <p class="Detail">Vui lòng xem sơ đồ sạc:</p>
      <img id="item33316_33603" src="/assets/images/3ba3ea1817d3d122cd0c0ac84ec5d1d2e99232b95f74289aab2493b901bda427.png" alt="Sơ đồ cổng sạc VF 7" class="" />
      <p class="Detail"><strong>CẢNH BÁO:</strong> Không cắm sạc khi tay ướt.</p>
    `

    const res = canonicalizeDocumentContent(html)
    expect(res.extractedImages.length).toBe(1)
    expect(res.extractedImages[0].id).toBe('item33316_33603')
    expect(res.extractedImages[0].alt).toBe('Sơ đồ cổng sạc VF 7')
    expect(res.extractedImages[0].url).toBe('/assets/images/3ba3ea1817d3d122cd0c0ac84ec5d1d2e99232b95f74289aab2493b901bda427.png')

    expect(res.normalizedMarkdown).toContain('[img: 3ba3ea1817d3d122cd0c0ac84ec5d1d2e99232b95f74289aab2493b901bda427.png]')
    expect(res.normalizedMarkdown).toContain('**CẢNH BÁO:** Không cắm sạc khi tay ướt.')
    expect(res.warningsCount).toBe(1)
    expect(res.checksum.length).toBe(64)
  })

  it('converts HTML tables to markdown tables accurately', () => {
    const html = `
      <table>
        <tr><th>Thông số</th><th>VF 7 Plus</th></tr>
        <tr><td>Công suất</td><td>348 hp</td></tr>
        <tr><td>Quãng đường</td><td>431 km</td></tr>
      </table>
    `

    const res = canonicalizeDocumentContent(html)
    expect(res.tablesCount).toBe(1)
    expect(res.normalizedMarkdown).toContain('| Thông số | VF 7 Plus |')
    expect(res.normalizedMarkdown).toContain('| --- | --- |')
    expect(res.normalizedMarkdown).toContain('| Công suất | 348 hp |')
    expect(res.normalizedMarkdown).toContain('| Quãng đường | 431 km |')
  })

  it('is deterministic: same content yields identical checksum', () => {
    const text1 = '<p>Nội dung hướng dẫn sử dụng VinFast</p>'
    const text2 = '<p>   Nội dung hướng dẫn sử dụng VinFast   </p>'

    const res1 = canonicalizeDocumentContent(text1)
    const res2 = canonicalizeDocumentContent(text2)
    expect(res1.checksum).toBe(res2.checksum)
    expect(res1.normalizedMarkdown).toBe('Nội dung hướng dẫn sử dụng VinFast')
  })
})
