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

  it('does not make links clickable before the sanitized turn view arrives', () => {
    const markup = renderToStaticMarkup(
      <MarkdownMessage content={'[VF 3](/cars/model-tu-bia)'} streaming />,
    )

    expect(markup).not.toContain('href=')
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

  it('renders common model math delimiters without overflowing the message', () => {
    const markup = renderToStaticMarkup(
      <MarkdownMessage content={'Công thức:\n\\[\\frac{d}{dx}\\left(\\int_0^x \\sqrt{t^2+1}\\,dt\\right)=\\sqrt{x^2+1}\\]'} />,
    )

    expect(markup).toContain('class="katex-display"')
    expect(markup).toContain('class="katex-html"')
    expect(markup).toContain('<math')
    expect(markup).toContain('overflow-x-auto')
    expect(markup).toContain('py-3')
    expect(markup).not.toContain('overflow-y-hidden')
  })

  it('temporarily completes an unfinished code fence while streaming', () => {
    const markup = renderToStaticMarkup(
      <MarkdownMessage content={'```ts\nconst vehicle = "VF 8"'} streaming />,
    )

    expect(markup).toContain('<pre')
    expect(markup).toContain('const vehicle')
  })

  it('renders inline images for valid trusted image URLs', () => {
    const markup = renderToStaticMarkup(
      <MarkdownMessage
        content={'Sơ đồ cổng sạc VF 9:\n\n![Cổng sạc CCS2](https://om.vinfastauto.com/vfom/0d/d1a9/1a965/vi/assets/images/item61636_122988.png)\n\nChi tiết phần AC và DC.'}
      />,
    )

    expect(markup).toContain('<figure')
    expect(markup).toContain('src="https://om.vinfastauto.com/vfom/0d/d1a9/1a965/vi/assets/images/item61636_122988.png"')
    expect(markup).toContain('Cổng sạc CCS2')
  })

  it('resolves compact media references to the exact approved URL', () => {
    const url = 'https://om.vinfastauto.com/vfom/0d/d1a9/1a965/vi/assets/images/item61636_122988.png'
    const markup = renderToStaticMarkup(
      <MarkdownMessage
        content={'Sơ đồ cổng sạc VF 9:\n\n[media:2]\n\nChi tiết phần AC và DC.'}
        mediaItems={[
          {
            assetId: 'asset-2',
            annotationId: 'ann-2',
            title: 'Cổng sạc CCS2',
            summary: 'Sơ đồ cổng sạc',
            url,
            alt: 'Cổng sạc CCS2',
            mimeType: 'image/png',
            width: 690,
            height: 388,
            safetyCritical: false,
            citationId: 'cite:vinfast:vf-9',
            reference: 'media:2',
          },
        ]}
      />,
    )

    expect(markup).toContain('<figure')
    expect(markup).toContain(`src="${url}"`)
    expect(markup).not.toContain('[media:2]')
  })

  it('preprocesses raw [img: ...] tags into inline images using mediaItems', () => {
    const markup = renderToStaticMarkup(
      <MarkdownMessage
        content={'Phần điện áp cao:\n\n[img: item61636_122977.png]\n\nChi tiết các chân tiếp xúc.'}
        mediaItems={[
          {
            assetId: 'asset-1',
            annotationId: 'ann-1',
            title: 'Sơ đồ cổng sạc AC Type 2',
            summary: 'Sơ đồ mặt cắt cổng sạc AC Type 2',
            url: 'https://om.vinfastauto.com/vfom/0d/d1a9/1a965/vi/assets/images/item61636_122977.png',
            alt: 'Sơ đồ cổng sạc AC Type 2',
            mimeType: 'image/png',
            width: 690,
            height: 388,
            safetyCritical: true,
            citationId: 'cite:vinfast:vf-9',
          },
        ]}
      />,
    )

    expect(markup).toContain('<figure')
    expect(markup).toContain('src="https://om.vinfastauto.com/vfom/0d/d1a9/1a965/vi/assets/images/item61636_122977.png"')
    expect(markup).toContain('Sơ đồ cổng sạc AC Type 2')
    expect(markup).toContain('Lưu ý an toàn')
  })
})
