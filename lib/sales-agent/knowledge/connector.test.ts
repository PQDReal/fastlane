import { describe, expect, it } from 'vitest'
import {
  APPROVED_31_MANUAL_EDITIONS,
  VinFastManualMarkdownConnector,
  VinFastManualStagingConnector,
  parseEditionId,
} from './connector'

describe('VinFast manual connectors (baseline v2)', () => {
  it('locks the exact 31-edition code-ready allowlist', () => {
    expect(APPROVED_31_MANUAL_EDITIONS).toHaveLength(31)
    expect(new Set(APPROVED_31_MANUAL_EDITIONS).size).toBe(31)
    expect(APPROVED_31_MANUAL_EDITIONS).toContain('Lạc Hồng 900 LX_2025')
  })

  it('creates stable lowercase vehicle keys and canonical Lạc Hồng identity', () => {
    expect(parseEditionId('VF 8_2025')).toMatchObject({
      vehicleKey: 'vf-8',
      vehicleModel: 'VF 8',
      modelYear: 2025,
      canonicalDocumentKey: 'vinfast:vf-8:2025:vi-VN',
    })
    expect(parseEditionId('VF 8 - MY26_2026').canonicalDocumentKey)
      .toBe('vinfast:vf-8-my26:2026:vi-VN')
    expect(parseEditionId('Lac Hong 900 LX_2025')).toMatchObject({
      vehicleKey: 'lac-hong-900-lx',
      vehicleModel: 'Lạc Hồng 900 LX',
    })
  })

  it('builds a Markdown-first document tree and rejects duplicate source ids', () => {
    const connector = new VinFastManualMarkdownConnector()
    const sections = [{
      chapterTitle: 'Pin và sạc',
      sectionTitle: 'Hướng dẫn sạc',
      sectionId: 'node-1',
      filePath: 'chapters/08/02.md',
      contentMarkdown: '# Hướng dẫn sạc\n\nBước 1: Kết nối cáp sạc.',
    }]
    const tree = connector.transformMarkdownSectionsToDocumentTree('VF 8_2025', sections)
    expect(tree.documentKey).toBe('vinfast:vf-8:2025:vi-VN')
    expect(tree.vehicleKey).toBe('vf-8')
    expect(tree.sections[0].sourceNodeId).toBe('node-1')

    expect(() => connector.transformMarkdownSectionsToDocumentTree('VF 8_2025', [
      ...sections,
      { ...sections[0], filePath: 'duplicate.md' },
    ])).toThrow(/Duplicate source node id/)
  })

  it('keeps the legacy staging connector read-only but bound to the v2 allowlist', () => {
    const connector = new VinFastManualStagingConnector()
    expect(connector.isEditionApproved('Lạc Hồng 900 LX_2026')).toBe(true)
    expect(() => connector.transformStagingNodesToDocumentTree('FAKE_EDITION_2099', []))
      .toThrow(/31-edition allowlist/)
  })
})
