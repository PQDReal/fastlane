import { createHash } from 'node:crypto'

export interface ExtractedImageRef {
  id?: string
  alt: string
  url: string
}

export interface CanonicalizedContent {
  raw: string
  normalizedMarkdown: string
  checksum: string
  extractedImages: ExtractedImageRef[]
  warningsCount: number
  tablesCount: number
}

/**
 * Chuẩn hóa nội dung tài liệu / sổ tay kỹ thuật VinFast (A19-KR-202):
 * - Phân tích và bảo toàn thẻ hình ảnh HTML <img> (id, alt, src) và Markdown ![]()
 * - Chuyển đổi bảng HTML (<table>, <tr>, <td>, <th>) sang định dạng Markdown table
 * - Bảo toàn các cảnh báo, lưu ý, chú thích nguy hiểm
 * - Loại bỏ các thẻ HTML dư thừa (div, span, style, script, inline styles)
 * - Chuẩn hóa khoảng trắng Unicode (NFC normalization, xóa khoảng trắng thừa, xóa dòng trống liên tiếp)
 * - Tính toán mã băm SHA-256 bất biến
 */
export function canonicalizeDocumentContent(rawContent: string): CanonicalizedContent {
  if (!rawContent || typeof rawContent !== 'string') {
    return {
      raw: '',
      normalizedMarkdown: '',
      checksum: createHash('sha256').update('').digest('hex'),
      extractedImages: [],
      warningsCount: 0,
      tablesCount: 0,
    }
  }

  let text = rawContent.normalize('NFC')

  // 1. Loại bỏ các thẻ style, script
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '')
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '')

  // 2. Trích xuất và chuyển đổi thẻ hình ảnh HTML <img ...> sang Markdown trước khi strip HTML
  const extractedImages: ExtractedImageRef[] = []

  // HTML img parser: <img id="..." src="..." alt="..." ... />
  text = text.replace(/<img\b([^>]*)\/?>/gi, (_fullMatch, attrsStr: string) => {
    const srcMatch = attrsStr.match(/\bsrc=["']([^"']+)["']/i)
    if (!srcMatch || !srcMatch[1]) return ''

    const src = srcMatch[1].trim()
    const idMatch = attrsStr.match(/\bid=["']([^"']+)["']/i)
    const altMatch = attrsStr.match(/\balt=["']([^"']*)["']/i)

    const id = idMatch ? idMatch[1].trim() : undefined
    const alt = altMatch ? altMatch[1].trim() : (id ? `figure-${id}` : 'image')
    const finalUrl = id ? `${src}#id=${id}` : src

    extractedImages.push({
      id,
      alt,
      url: src,
    })

    return `\n\n![${alt}](${finalUrl})\n\n`
  })

  // 3. Trích xuất Markdown images đã có sẵn
  const mdImgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
  let mdMatch: RegExpExecArray | null
  while ((mdMatch = mdImgRegex.exec(text)) !== null) {
    const rawUrl = mdMatch[2].trim()
    const [baseUrl, fragment] = rawUrl.split('#id=')
    const id = fragment || undefined
    const alt = mdMatch[1].trim()

    if (!extractedImages.some((img) => img.url === baseUrl && img.id === id)) {
      extractedImages.push({
        id,
        alt,
        url: baseUrl,
      })
    }
  }

  // 4. Chuyển đổi HTML Tables sang Markdown Tables
  text = text.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_match, tableBody: string) => {
    const rows: string[][] = []
    const rowMatches = tableBody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)

    for (const rowMatch of rowMatches) {
      const cells: string[] = []
      const cellMatches = rowMatch[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)
      for (const cellMatch of cellMatches) {
        // Strip nested tags inside cell
        const cleanCell = cellMatch[1]
          .replace(/<\/?[^>]+(>|$)/g, '')
          .replace(/[\r\n]+/g, ' ')
          .replace(/\|/g, '\\|')
          .trim()
        cells.push(cleanCell)
      }
      if (cells.length > 0) {
        rows.push(cells)
      }
    }

    if (rows.length === 0) return ''

    const maxCols = Math.max(...rows.map((r) => r.length))
    const normalizedRows = rows.map((r) => {
      while (r.length < maxCols) r.push('')
      return `| ${r.join(' | ')} |`
    })

    const header = normalizedRows[0]
    const separator = `| ${new Array(maxCols).fill('---').join(' | ')} |`
    const body = normalizedRows.slice(1).join('\n')

    return `\n\n${header}\n${separator}${body ? '\n' + body : ''}\n\n`
  })

  // 5. Chuyển đổi các thẻ HTML tiêu đề và định dạng văn bản sang Markdown
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
  text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n')
  text = text.replace(/<p class="[^"]*Heading[^"]*"[^>]*>([\s\S]*?)<\/p>/gi, '\n### $1\n')
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n')
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<strong>([\s\S]*?)<\/strong>/gi, '**$1**')
  text = text.replace(/<b>([\s\S]*?)<\/b>/gi, '**$1**')
  text = text.replace(/<em>([\s\S]*?)<\/em>/gi, '*$1*')
  text = text.replace(/<i>([\s\S]*?)<\/i>/gi, '*$1*')

  // 6. Loại bỏ tất cả thẻ HTML còn sót lại
  text = text.replace(/<\/?[^>]+(>|$)/g, '')

  // 7. Chuẩn hóa khoảng trắng và dòng trống liên tiếp
  text = text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // 8. Đếm số lượng cảnh báo & bảng
  const warningsCount = (text.match(/(\*\*CẢNH BÁO|\*\*LƯU Ý|\*\*CHÚ Ý|\*\*NGUY HIỂM|> \[!WARNING\]|> \[!CAUTION\])/gi) || []).length
  const tablesCount = (text.match(/^\|(?:\s*[-:]+\s*\|)+/gm) || []).length

  // 9. Tính checksum SHA-256
  const checksum = createHash('sha256').update(text).digest('hex')

  return {
    raw: rawContent,
    normalizedMarkdown: text,
    checksum,
    extractedImages,
    warningsCount,
    tablesCount,
  }
}
