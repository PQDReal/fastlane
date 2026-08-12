import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { MarkdownMessage } from './markdown-message'

describe('MarkdownMessage', () => {
  it('renders comparison tables, ordered steps and inline emphasis', () => {
    const markup = renderToStaticMarkup(
      <MarkdownMessage content={`### So sánh nhanh

| Tiêu chí | VF 7 | VF 8 |
|---|---:|---:|
| Tầm hoạt động | **450 km** | 471 km |

### Các bước
1. Chọn xe
2. Chuẩn bị giấy tờ`} />,
    )

    expect(markup).toContain('<table')
    expect(markup).toContain('<ol')
    expect(markup).toContain('<strong')
    expect(markup).toContain('So sánh nhanh')
  })

  it('allows internal navigation but neutralizes external and protocol-relative links', () => {
    const markup = renderToStaticMarkup(
      <MarkdownMessage content={'[Xem VF 8](/cars/vf-8) [Trang lạ](https://example.com) [Không an toàn](//example.com)'} />,
    )

    expect(markup).toContain('href="/cars/vf-8"')
    expect(markup).not.toContain('href="https://example.com"')
    expect(markup).not.toContain('href="//example.com"')
    expect(markup).toContain('Liên kết chưa được xác minh')
  })

  it('does not interpret raw HTML supplied by the model', () => {
    const markup = renderToStaticMarkup(
      <MarkdownMessage content={'Thông tin <script>malicious()</script> <b>không tin cậy</b>'} />,
    )

    expect(markup).not.toContain('<script>')
    expect(markup).not.toContain('<b>')
    expect(markup).toContain('malicious()')
    expect(markup).toContain('không tin cậy')
  })
})
