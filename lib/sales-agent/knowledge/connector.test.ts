import { describe, it, expect } from 'vitest'
import {
  VinFastManualStagingConnector,
  APPROVED_29_MANUAL_EDITIONS,
  parseEditionId,
} from './connector'

describe('VinFastManualStagingConnector (A19-KR-200 & 201)', () => {
  const connector = new VinFastManualStagingConnector()

  it('verifies that exactly 29 approved editions are in canonical allowlist', () => {
    expect(APPROVED_29_MANUAL_EDITIONS.length).toBe(29)
    expect(connector.isEditionApproved('VF 8_2025')).toBe(true)
    expect(connector.isEditionApproved('VF 3_2026')).toBe(true)
    expect(connector.isEditionApproved('UNKNOWN_CAR_9999')).toBe(false)
  })

  it('correctly parses edition identifiers into canonical keys', () => {
    const p1 = parseEditionId('VF 8_2025')
    expect(p1.vehicleModel).toBe('VF 8')
    expect(p1.modelYear).toBe(2025)
    expect(p1.canonicalDocumentKey).toBe('vinfast:VF8:2025:vi-VN')

    const p2 = parseEditionId('VF 8 - MY26_2026')
    expect(p2.canonicalDocumentKey).toBe('vinfast:VF8_MY26:2026:vi-VN')
  })

  it('transforms staging raw nodes into canonical document tree', () => {
    const rawNodes = [
      {
        id: 'node-c1',
        originalId: 'orig-1',
        modelId: 'VF 8_2025',
        title: 'Hệ thống an toàn',
        slug: 'he-thong-an-toan',
        level: 1,
        parentId: null,
        orderIndex: 1,
      },
      {
        id: 'node-s1',
        originalId: 'orig-2',
        modelId: 'VF 8_2025',
        title: 'Túi khí và dây đai',
        slug: 'tui-khi-va-day-dai',
        level: 2,
        parentId: 'node-c1',
        contentMarkdown: 'Xe trang bị 11 túi khí bảo vệ toàn diện.',
        orderIndex: 2,
      },
    ]

    const docTree = connector.transformStagingNodesToDocumentTree('VF 8_2025', rawNodes)
    expect(docTree.documentKey).toBe('vinfast:VF8:2025:vi-VN')
    expect(docTree.sections.length).toBe(1)
    expect(docTree.sections[0].chapterTitle).toBe('Hệ thống an toàn')
    expect(docTree.sections[0].sectionTitle).toBe('Túi khí và dây đai')
  })

  it('throws error when transforming non-approved edition', () => {
    expect(() => {
      connector.transformStagingNodesToDocumentTree('FAKE_EDITION_2099', [])
    }).toThrow(/not in the approved 29 manual allowlist/)
  })
})
