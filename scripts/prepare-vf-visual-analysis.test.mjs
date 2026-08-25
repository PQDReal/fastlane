import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  buildVfVisualAnalysisData,
  extractRawImageOccurrences,
  splitDocumentSections,
} from './lib/vf-visual-analysis-build.mjs'

describe('VF visual analysis packet preparation', () => {
  it('extracts HTML and Markdown image occurrences in source order', () => {
    const images = extractRawImageOccurrences([
      '<img id="a" alt="Sơ đồ A" src="https://example.test/a.png">',
      'Nội dung',
      '![Sơ đồ B](https://example.test/b.png#id=b)',
    ].join('\n\n'))

    expect(images).toEqual([
      expect.objectContaining({
        sourceUrl: 'https://example.test/a.png',
        fileName: 'a.png',
        alt: 'Sơ đồ A',
        id: 'a',
        sourceSyntax: 'HTML_IMG',
      }),
      expect.objectContaining({
        sourceUrl: 'https://example.test/b.png',
        fileName: 'b.png',
        alt: 'Sơ đồ B',
        id: 'b',
        sourceSyntax: 'MARKDOWN_IMAGE',
      }),
    ])
  })

  it('splits canonical documents back into source-node sections', () => {
    const sections = splitDocumentSections([
      '<!-- source_node_id:node-a; path:chapters/a.md -->',
      '# A',
      '',
      'Nội dung A',
      '',
      '---',
      '',
      '<!-- source_node_id:node-b; path:chapters/b.md -->',
      '# B',
      '',
      'Nội dung B',
    ].join('\n'))

    expect(sections).toHaveLength(2)
    expect(sections[0]).toMatchObject({
      sourceNodeId: 'node-a',
      sourcePath: 'chapters/a.md',
    })
    expect(sections[0].rawMarkdown).not.toContain('---')
    expect(sections[1].rawMarkdown).toContain('Nội dung B')
  })

  it('builds one packet per chunk-backed URL with surrounding and sibling context', () => {
    const document = {
      editionId: 'VF 8_2026',
      documentKey: 'vinfast:vf-8:2026:vi-VN',
      vehicleKey: 'vf-8',
      vehicleModel: 'VF 8',
      modelYear: 2026,
      locale: 'vi-VN',
      market: 'VN',
      sourceUri: 'https://example.test/manual',
      contentMarkdown: [
        '<!-- source_node_id:node-charge; path:chapters/charge.md -->',
        '# Sạc pin',
        '',
        'Kiểm tra cổng sạc trước khi thao tác.',
        '',
        '![Bước một](https://example.test/step-1.png)',
        '',
        'Cắm súng sạc đúng chiều.',
        '',
        '![Bước hai](https://example.test/step-2.png)',
        '',
        'Xác nhận đèn báo chuyển màu xanh.',
      ].join('\n'),
    }
    const baseChunk = {
      editionId: document.editionId,
      documentKey: document.documentKey,
      vehicleKey: document.vehicleKey,
      vehicleModel: document.vehicleModel,
      modelYear: document.modelYear,
      sourceNodeId: 'node-charge',
      sectionTitle: 'Sạc > Quy trình',
      parentHierarchyPath: 'root/c01_charge',
      hierarchyPath: 'root/c01_charge/s01_process/leaf_01',
      sectionAnchor: document.documentKey + '#node-charge-p1',
      chunkLevel: 3,
      chunkIndex: 1,
      contentHash: 'hash-1',
      content: '[img: step-1.png]\n\nCắm súng sạc đúng chiều.\n\n[img: step-2.png]',
      extractedImages: [
        { url: 'https://example.test/step-1.png', fileName: 'step-1.png' },
        { url: 'https://example.test/step-2.png', fileName: 'step-2.png' },
      ],
      isTable: false,
      isProcedure: true,
      isWarning: false,
    }
    const overlapChunk = {
      ...baseChunk,
      chunkIndex: 2,
      contentHash: 'hash-2',
      extractedImages: [
        { url: 'https://example.test/step-2.png', fileName: 'step-2.png' },
      ],
    }
    const excludedChunk = {
      ...baseChunk,
      documentKey: 'vinfast:lac-hong-900-lx:2026:vi-VN',
      vehicleKey: 'lac-hong-900-lx',
      extractedImages: [
        { url: 'https://example.test/excluded.png', fileName: 'excluded.png' },
      ],
    }

    const result = buildVfVisualAnalysisData({
      documents: [document],
      chunks: [baseChunk, overlapChunk, excludedChunk],
    })

    expect(result.report).toMatchObject({
      status: 'LOCAL_PACKETS_VALIDATED_NOT_ANALYZED',
      vfDocumentCount: 1,
      vfChunkCount: 2,
      chunkImageUrlOccurrences: 3,
      chunkBackedSourceOccurrences: 2,
      packetCount: 2,
      mappingIssueCount: 0,
    })
    expect(result.packets).toHaveLength(2)
    expect(result.occurrences).toHaveLength(2)

    const first = result.occurrences.find((item) => item.image.fileName === 'step-1.png')
    expect(first.context.beforeText).toContain('Kiểm tra cổng sạc')
    expect(first.context.afterText).toContain('Cắm súng sạc')
    expect(first.relatedImages.nearby).toEqual([
      expect.objectContaining({ fileName: 'step-2.png' }),
    ])
    expect(first.image.contentSha256).toBeNull()
  })

  it('keeps approval outside the AI output contract', () => {
    const schema = JSON.parse(fs.readFileSync(
      path.resolve('scripts/data/vf-visual-annotation-output.schema.json'),
      'utf8',
    ))
    expect(schema.properties.decision.enum).not.toContain('APPROVED')
    expect(schema.properties.packetId.pattern).toBe('^visual_[a-f0-9]{32}$')
    expect(schema.properties.relations.items.properties.targetOccurrenceId.pattern)
      .toBe('^occ_[a-f0-9]{32}$')
  })
})
